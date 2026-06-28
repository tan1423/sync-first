// Optional, build-safe environment config.
//
// IMPORTANT: this must never throw at import time. Next.js evaluates route
// modules during `next build` (page-data collection), often BEFORE runtime
// secrets are injected by the host. Required secrets (DATABASE_URL, JWT_SECRET)
// are therefore read lazily where they're used (lib/db.ts, lib/jwt.ts), not here.
import { z } from "zod";

const schema = z.object({
  // AI add-on (optional — feature degrades gracefully if unset).
  AI_API_KEY: z.string().optional().default(""),
  AI_MODEL: z.string().optional().default("llama-3.3-70b-versatile"),
  // WS payload cap (used by the sync server; harmless default elsewhere).
  SYNC_MAX_PAYLOAD_BYTES: z.coerce.number().int().positive().default(1_048_576),
});

// All fields optional with defaults → parse never throws, even at build time.
export const env = schema.parse({
  AI_API_KEY: process.env.AI_API_KEY,
  AI_MODEL: process.env.AI_MODEL,
  SYNC_MAX_PAYLOAD_BYTES: process.env.SYNC_MAX_PAYLOAD_BYTES,
});

export const PUBLIC_SYNC_URL = process.env.NEXT_PUBLIC_SYNC_URL ?? "";
