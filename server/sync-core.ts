/**
 * Reusable Yjs sync engine (Yjs sync protocol over raw WebSocket).
 *
 * This module contains all the room/persistence/auth logic and exposes a
 * `createSyncHandler()` so it can be attached to ANY Node http.Server — whether
 * that's the standalone sync server (server/sync-server.ts) or the combined
 * Next.js + WebSocket server (server/server.ts).
 *
 * Security / authorization it enforces:
 *   1. AUTHN  — every socket must present a valid JWT (same secret as the app).
 *   2. AUTHZ  — the user must be a Member of the document; role is resolved.
 *   3. VIEWER READ-ONLY — viewers receive updates but their inbound document
 *      updates are dropped, so they can never push state.
 *   4. OOM GUARD — ws `maxPayload` rejects oversized frames before buffering,
 *      plus a per-connection message-rate limiter.
 *   5. PERSISTENCE — the merged CRDT state is debounced-written to MongoDB.
 */
import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { verifyToken, parseCookie, AUTH_COOKIE } from "../lib/jwt";
import { loadDoc, persistDoc } from "../lib/yjs-persistence";
import { Member, type Role } from "../lib/models";

const MAX_PAYLOAD = Number(process.env.SYNC_MAX_PAYLOAD_BYTES ?? 1_048_576);
const PERSIST_DEBOUNCE_MS = 2000;
const MSG_RATE_LIMIT = 200; // max messages per RATE_WINDOW_MS per socket
const RATE_WINDOW_MS = 1000;

// y-protocols message tags
const messageSync = 0;
const messageAwareness = 1;
// sync sub-message tags (syncStep1=0 is the only inbound type viewers may send)
const syncStep2 = 1;
const syncUpdate = 2;

interface Conn {
  ws: WebSocket;
  readonly: boolean;
  userId: string;
  msgCount: number;
  windowStart: number;
}

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Set<Conn>;
  persistTimer: ReturnType<typeof setTimeout> | null;
  dirty: boolean;
}

const rooms = new Map<string, Room>();

async function getRoom(documentId: string): Promise<Room> {
  let room = rooms.get(documentId);
  if (room) return room;

  const doc = await loadDoc(documentId);
  const awareness = new awarenessProtocol.Awareness(doc);
  room = { doc, awareness, conns: new Set(), persistTimer: null, dirty: false };
  rooms.set(documentId, room);

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, messageSync);
    syncProtocol.writeUpdate(enc, update);
    const msg = encoding.toUint8Array(enc);
    for (const c of room!.conns) {
      if (c.ws !== origin && c.ws.readyState === WebSocket.OPEN) c.ws.send(msg);
    }
    schedulePersist(documentId, room!);
  });

  awareness.on(
    "update",
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      const changed = added.concat(updated, removed);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageAwareness);
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changed),
      );
      const msg = encoding.toUint8Array(enc);
      for (const c of room!.conns) {
        if (c.ws !== origin && c.ws.readyState === WebSocket.OPEN) c.ws.send(msg);
      }
    },
  );

  return room;
}

function schedulePersist(documentId: string, room: Room) {
  room.dirty = true;
  if (room.persistTimer) return;
  room.persistTimer = setTimeout(async () => {
    room.persistTimer = null;
    if (!room.dirty) return;
    room.dirty = false;
    try {
      await persistDoc(documentId, room.doc);
    } catch (err) {
      console.error(`[sync] persist failed for ${documentId}:`, err);
    }
  }, PERSIST_DEBOUNCE_MS);
}

/** Resolve {userId, role, documentId} from the upgrade request, or null. */
async function authenticate(
  req: http.IncomingMessage,
): Promise<{ userId: string; role: Role; documentId: string } | null> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const documentId = url.searchParams.get("doc");
  if (!documentId) return null;

  // Token via cookie (same-origin) or ?token= (cross-origin / tests).
  const token =
    parseCookie(req.headers.cookie, AUTH_COOKIE) ?? url.searchParams.get("token") ?? "";
  const claims = await verifyToken(token);
  if (!claims) return null;

  const member = await Member.findOne({ documentId, userId: claims.sub }).lean();
  if (!member) return null;

  return { userId: claims.sub, role: member.role as Role, documentId };
}

function onConnection(
  ws: WebSocket,
  auth: { userId: string; role: Role; documentId: string },
) {
  getRoom(auth.documentId).then((room) => {
    const conn: Conn = {
      ws,
      readonly: auth.role === "VIEWER",
      userId: auth.userId,
      msgCount: 0,
      windowStart: Date.now(),
    };
    room.conns.add(conn);

    // 1) Send our SyncStep1 (state vector) so the client sends us what we miss.
    {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.writeSyncStep1(enc, room.doc);
      ws.send(encoding.toUint8Array(enc));
    }
    // 2) Send current awareness state.
    {
      const states = room.awareness.getStates();
      if (states.size > 0) {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, messageAwareness);
        encoding.writeVarUint8Array(
          enc,
          awarenessProtocol.encodeAwarenessUpdate(
            room.awareness,
            Array.from(states.keys()),
          ),
        );
        ws.send(encoding.toUint8Array(enc));
      }
    }

    ws.on("message", (data: ArrayBuffer | Buffer) => {
      const now = Date.now();
      if (now - conn.windowStart > RATE_WINDOW_MS) {
        conn.windowStart = now;
        conn.msgCount = 0;
      }
      if (++conn.msgCount > MSG_RATE_LIMIT) {
        ws.close(1008, "rate limit exceeded");
        return;
      }
      handleMessage(conn, room, new Uint8Array(data as ArrayBuffer));
    });

    ws.on("close", () => {
      room.conns.delete(conn);
      if (room.conns.size === 0) {
        if (room.dirty) persistDoc(auth.documentId, room.doc).catch(() => {});
        rooms.delete(auth.documentId);
      }
    });

    ws.on("error", () => ws.close());
  });
}

function handleMessage(conn: Conn, room: Room, bytes: Uint8Array) {
  try {
    const decoder = decoding.createDecoder(bytes);
    const messageType = decoding.readVarUint(decoder);

    if (messageType === messageSync) {
      const subType = decoding.readVarUint(decoder);
      // Viewer attempting to push state — silently drop. (Authorization.)
      if (conn.readonly && (subType === syncStep2 || subType === syncUpdate)) return;

      const full = decoding.createDecoder(bytes);
      const encoder = encoding.createEncoder();
      decoding.readVarUint(full); // consume messageSync tag
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(full, encoder, room.doc, conn.ws);
      if (encoding.length(encoder) > 1) conn.ws.send(encoding.toUint8Array(encoder));
    } else if (messageType === messageAwareness) {
      awarenessProtocol.applyAwarenessUpdate(
        room.awareness,
        decoding.readVarUint8Array(decoder),
        conn.ws,
      );
    }
  } catch (err) {
    console.error("[sync] bad message:", err);
    conn.ws.close(1003, "malformed message");
  }
}

/**
 * Create an upgrade handler. `basePath` "" handles every WebSocket upgrade
 * (standalone server); "/sync" handles only that path so a combined server can
 * forward other upgrades (e.g. Next.js HMR) elsewhere.
 *
 * Returns `handleUpgrade(req, socket, head): boolean` — true if it took the
 * upgrade (path matched), false otherwise.
 */
export function createSyncHandler(basePath = "") {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  wss.on("connection", (ws: WebSocket, _req: http.IncomingMessage, auth: unknown) =>
    onConnection(ws, auth as { userId: string; role: Role; documentId: string }),
  );

  function handleUpgrade(
    req: http.IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): boolean {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (basePath && !url.pathname.startsWith(basePath)) return false;

    authenticate(req)
      .then((auth) => {
        if (!auth) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req, auth));
      })
      .catch(() => socket.destroy());
    return true;
  }

  return { handleUpgrade, wss };
}

export const SYNC_CONFIG = { MAX_PAYLOAD, PERSIST_DEBOUNCE_MS };

/** Flush all dirty rooms to the DB (call on graceful shutdown). */
export async function flushAllRooms(): Promise<void> {
  for (const [id, room] of rooms) {
    if (room.dirty) await persistDoc(id, room.doc).catch(() => {});
  }
}