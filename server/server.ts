/**
 * Combined production server: runs the Next.js app AND the Yjs WebSocket sync
 * engine in ONE process on ONE port. This is what we deploy to Railway as a
 * single service.
 *
 *   GET/POST  →  Next.js (pages, API routes)
 *   WS /sync  →  Yjs real-time sync engine
 *
 * Local development still uses two processes (`npm run dev`); this combined
 * server is the `npm start` entrypoint for production.
 */
import "dotenv/config";
import http from "node:http";
import next from "next";
import { connectDB } from "../lib/db";
import { mongoose } from "../lib/models";
import { createSyncHandler, flushAllRooms } from "./sync-core";

// Force production unless explicitly asked for dev (keeps `npm start` simple and
// cross-platform — no NODE_ENV juggling needed).
const dev = process.env.SERVER_DEV === "1";
const PORT = Number(process.env.PORT ?? 3000);

async function main() {
  await connectDB();

  const app = next({ dev });
  await app.prepare();
  // These must be obtained AFTER prepare().
  const handle = app.getRequestHandler();
  const upgradeNext = app.getUpgradeHandler();

  // WebSocket sync only on the /sync path; everything else is Next's.
  const { handleUpgrade } = createSyncHandler("/sync");

  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  server.on("upgrade", (req, socket, head) => {
    if (handleUpgrade(req, socket, head)) return;
    // Not a sync socket → let Next handle it (e.g. HMR in dev).
    upgradeNext(req, socket, head);
  });

  server.listen(PORT, () => {
    console.log(`[server] Next.js + sync listening on :${PORT} (dev=${dev})`);
    console.log(`[server] WebSocket sync path: /sync`);
  });
}

main().catch((err) => {
  console.error("[server] fatal:", err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  console.log("\n[server] shutting down, flushing dirty rooms…");
  await flushAllRooms();
  await mongoose.disconnect();
  process.exit(0);
});
