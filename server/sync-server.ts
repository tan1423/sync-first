/**
 * Standalone WebSocket sync server.
 *
 * Used in local development (`npm run dev:sync`, alongside `next dev`) and if you
 * ever want to deploy the sync engine separately from the app. In production on
 * Railway we instead use the COMBINED server (server/server.ts), which runs the
 * Next.js app and this sync engine in one process on one port.
 */
import "dotenv/config";
import http from "node:http";
import { connectDB } from "../lib/db";
import { mongoose } from "../lib/models";
import { createSyncHandler, flushAllRooms, SYNC_CONFIG } from "./sync-core";

const PORT = Number(process.env.PORT ?? process.env.SYNC_PORT ?? 4444);

// basePath "" → handle every WebSocket upgrade on this port.
const { handleUpgrade } = createSyncHandler("");

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("collab-editor sync server ok\n");
});

server.on("upgrade", (req, socket, head) => {
  if (!handleUpgrade(req, socket, head)) socket.destroy();
});

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`[sync] WebSocket sync server listening on :${PORT}`);
      console.log(
        `[sync] maxPayload=${SYNC_CONFIG.MAX_PAYLOAD} bytes, persist debounce=${SYNC_CONFIG.PERSIST_DEBOUNCE_MS}ms`,
      );
    });
  })
  .catch((err) => {
    console.error("[sync] failed to connect to MongoDB:", err);
    process.exit(1);
  });

process.on("SIGINT", async () => {
  console.log("\n[sync] shutting down, flushing dirty rooms…");
  await flushAllRooms();
  await mongoose.disconnect();
  process.exit(0);
});