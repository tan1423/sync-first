// Centralised, validated environment access. Throws loudly at boot if a
// required secret is missing rather than failing mysteriously at request time.
import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  SYNC_PORT: z.coerce.number().int().positive().default(4444),
  SYNC_MAX_PAYLOAD_BYTES: z.coerce.number().int().positive().default(1_048_576),
  AI_API_KEY: z.string().optional().default(""),
  AI_MODEL: z.string().optional().default("llama-3.3-70b-versatile"),
});

// Only parse on the server. Importing this from a client component would throw.
export const env = serverSchema.parse(process.env);

export const PUBLIC_SYNC_URL =
  process.env.NEXT_PUBLIC_SYNC_URL ?? "ws://localhost:4444";
