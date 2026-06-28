"use client";

import { useEffect, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";

/**
 * Resolve the sync-server URL:
 *  - If NEXT_PUBLIC_SYNC_URL is set, use it (local dev points to ws://localhost:4444,
 *    or a separate sync deployment).
 *  - Otherwise derive a same-origin "/sync" URL — this is the combined-server
 *    (single Railway service) case, where the WebSocket lives on the app domain.
 */
function resolveSyncUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SYNC_URL;
  if (explicit && explicit.length > 0) return explicit;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/sync`;
}

export type SyncStatus =
  | "offline" // no network
  | "connecting" // network up, handshaking
  | "connected" // socket open, syncing
  | "synced" // initial sync complete, live
  | "local"; // working purely from IndexedDB (server unreachable)

export interface CollabHandle {
  doc: Y.Doc;
  provider: WebsocketProvider | null;
  status: SyncStatus;
  /** True once the local IndexedDB copy has loaded — UI can paint immediately. */
  localLoaded: boolean;
  peers: number;
}

/**
 * Local-first collaborative document.
 *
 * Order of operations matters for the "zero network blocking" requirement:
 *   1. Create the Y.Doc and attach IndexedDB FIRST. The editor binds to the doc
 *      and paints from local storage with no network in the critical path.
 *   2. Only THEN open the WebSocket. When it connects, the Yjs sync protocol
 *      reconciles local (incl. offline edits) with server state via a CRDT
 *      union — offline work is merged, never overwritten.
 */
export function useCollab(
  documentId: string,
  user: { name: string; color: string },
  canWrite: boolean,
): CollabHandle {
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [localLoaded, setLocalLoaded] = useState(false);
  const [peers, setPeers] = useState(0);
  // Provider is exposed via state so consumers re-render when realtime is ready.
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);

  // Create the Y.Doc once (lazy state init) — stable for the component's life,
  // safe to read during render, and survives React Strict Mode's effect replay.
  const [doc] = useState<Y.Doc>(() => new Y.Doc());

  useEffect(() => {
    let cancelled = false;

    // 1) LOCAL FIRST — IndexedDB persistence (works fully offline).
    const idb = new IndexeddbPersistence(`collab-${documentId}`, doc);
    idb.once("synced", () => {
      if (!cancelled) setLocalLoaded(true);
    });

    let provider: WebsocketProvider | null = null;

    // 2) THEN connect realtime. Fetch a short-lived token first.
    (async () => {
      // Reflect an initial offline state (async, so not a sync setState in the
      // effect body).
      if (!navigator.onLine) setStatus("offline");
      let token = "";
      try {
        const res = await fetch("/api/realtime-token");
        if (res.ok) token = (await res.json()).token ?? "";
      } catch {
        /* offline — IndexedDB still works; we'll retry via provider */
      }
      if (cancelled) return;

      provider = new WebsocketProvider(resolveSyncUrl(), documentId, doc, {
        params: { doc: documentId, token },
        connect: true,
      });
      setProvider(provider);

      // Viewers must not broadcast document updates. The server also enforces
      // this, but disabling local awareness write-through avoids noise.
      provider.awareness.setLocalStateField("user", {
        name: user.name,
        color: user.color,
        canWrite,
      });

      provider.on("status", (e: { status: string }) => {
        if (cancelled) return;
        if (e.status === "connected") setStatus("connected");
        else if (e.status === "connecting") setStatus("connecting");
        else if (e.status === "disconnected") setStatus("local");
      });

      provider.on("sync", (isSynced: boolean) => {
        if (!cancelled && isSynced) setStatus("synced");
      });

      provider.awareness.on("change", () => {
        if (!cancelled) setPeers(provider!.awareness.getStates().size);
      });
    })();

    // Reflect raw network transitions immediately for the status badge.
    const onOffline = () => !cancelled && setStatus("offline");
    const onOnline = () => !cancelled && setStatus("connecting");
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      // Tear down transports but NOT the Y.Doc: under Strict Mode the effect
      // re-runs with the same doc instance, and the doc is GC'd on real unmount.
      provider?.destroy();
      idb.destroy();
      setProvider(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  return {
    doc,
    provider,
    status,
    localLoaded,
    peers,
  };
}
