/**
 * Standalone real-time sync server (Yjs sync protocol over raw WebSocket).
 *
 * Why hand-rolled instead of the stock y-websocket bin?  Because the assignment
 * requires authorization and abuse protection that the stock server does not do:
 *
 *   1. AUTHN  — every socket must present a valid JWT (same secret as the app).
 *   2. AUTHZ  — the user must be a Member of the document; role is resolved.
 *   3. VIEWER READ-ONLY — viewers receive updates but their inbound document
 *      updates are dropped, so they can never push state.  (Must-Have.)
 *   4. OOM GUARD — ws `maxPayload` rejects oversized frames before buffering,
 *      plus a per-connection message-rate limiter.
 *   5. PERSISTENCE — the merged CRDT state is debounced-written to MongoDB.
 */
import "dotenv/config";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { verifyToken, parseCookie, AUTH_COOKIE } from "../lib/jwt";
import { loadDoc, persistDoc } from "../lib/yjs-persistence";
import { connectDB } from "../lib/db";
import { Member, mongoose, type Role } from "../lib/models";

// Hosting platforms (Railway/Render) inject the public port via PORT — honour
// it first; fall back to SYNC_PORT (local dev) and then a default.
const PORT = Number(process.env.PORT ?? process.env.SYNC_PORT ?? 4444);
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
  // simple token-bucket-ish counter
  msgCount: number;
  windowStart: number;
}

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Set<Conn>;
  persistTimer: NodeJS.Timeout | null;
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

  // Whenever the doc changes, broadcast and schedule a debounced persist.
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
    ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
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

/** Resolve {userId, role} from the upgrade request, or null to reject. */
async function authenticate(
  req: http.IncomingMessage,
): Promise<{ userId: string; role: Role; documentId: string } | null> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const documentId = url.searchParams.get("doc");
  if (!documentId) return null;

  // Token may arrive via cookie (browser) or ?token= (tests / non-cookie clients)
  const token =
    parseCookie(req.headers.cookie, AUTH_COOKIE) ?? url.searchParams.get("token") ?? "";
  const claims = await verifyToken(token);
  if (!claims) return null;

  const member = await Member.findOne({ documentId, userId: claims.sub }).lean();
  if (!member) return null;

  return { userId: claims.sub, role: member.role as Role, documentId };
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("collab-editor sync server ok\n");
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

server.on("upgrade", async (req, socket, head) => {
  // Authenticate BEFORE completing the WS handshake.
  const auth = await authenticate(req).catch(() => null);
  if (!auth) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req, auth);
  });
});

wss.on(
  "connection",
  async (
    ws: WebSocket,
    _req: http.IncomingMessage,
    auth: { userId: string; role: Role; documentId: string },
  ) => {
    const room = await getRoom(auth.documentId);
    const conn: Conn = {
      ws,
      readonly: auth.role === "VIEWER",
      userId: auth.userId,
      msgCount: 0,
      windowStart: Date.now(),
    };
    room.conns.add(conn);

    // 1) Send our SyncStep1 (state vector) so the client can send us what we miss.
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
      // ---- per-connection rate limit (cheap DoS guard) ----
      const now = Date.now();
      if (now - conn.windowStart > RATE_WINDOW_MS) {
        conn.windowStart = now;
        conn.msgCount = 0;
      }
      if (++conn.msgCount > MSG_RATE_LIMIT) {
        ws.close(1008, "rate limit exceeded");
        return;
      }

      const bytes = new Uint8Array(data as ArrayBuffer);
      handleMessage(conn, room, bytes);
    });

    ws.on("close", () => {
      room.conns.delete(conn);
      awarenessProtocol.removeAwarenessStates(
        room.awareness,
        [room.doc.clientID], // best-effort; client also clears its own
        null,
      );
      // Unload idle rooms to bound memory.
      if (room.conns.size === 0) {
        if (room.dirty) persistDoc(auth.documentId, room.doc).catch(() => {});
        rooms.delete(auth.documentId);
      }
    });

    ws.on("error", () => ws.close());
  },
);

function handleMessage(conn: Conn, room: Room, bytes: Uint8Array) {
  try {
    const decoder = decoding.createDecoder(bytes);
    const messageType = decoding.readVarUint(decoder);

    if (messageType === messageSync) {
      // Peek the sync sub-type to enforce viewer read-only.
      const subType = decoding.readVarUint(decoder);

      if (conn.readonly && (subType === syncStep2 || subType === syncUpdate)) {
        // Viewer attempting to push state — silently drop. (Authorization.)
        return;
      }

      // Re-decode from the start and let the protocol handle it properly.
      const full = decoding.createDecoder(bytes);
      const encoder = encoding.createEncoder();
      decoding.readVarUint(full); // consume messageSync tag
      encoding.writeVarUint(encoder, messageSync);
      // origin = conn.ws so the update handler doesn't echo back to sender
      syncProtocol.readSyncMessage(full, encoder, room.doc, conn.ws);
      if (encoding.length(encoder) > 1) {
        conn.ws.send(encoding.toUint8Array(encoder));
      }
    } else if (messageType === messageAwareness) {
      // Presence/cursors allowed for everyone (including viewers).
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

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`[sync] WebSocket sync server listening on :${PORT}`);
      console.log(`[sync] maxPayload=${MAX_PAYLOAD} bytes, persist debounce=${PERSIST_DEBOUNCE_MS}ms`);
    });
  })
  .catch((err) => {
    console.error("[sync] failed to connect to MongoDB:", err);
    process.exit(1);
  });

process.on("SIGINT", async () => {
  console.log("\n[sync] shutting down, flushing dirty rooms…");
  for (const [id, room] of rooms) {
    if (room.dirty) await persistDoc(id, room.doc).catch(() => {});
  }
  await mongoose.disconnect();
  process.exit(0);
});
