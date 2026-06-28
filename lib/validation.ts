// Zod schemas used to strictly validate every API payload. Bounded `.max()`
// lengths are a first line of defence against memory-exhaustion (OOM) attacks:
// oversized bodies are rejected before we ever allocate large structures.
import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(80),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const createDocumentSchema = z.object({
  title: z.string().min(1).max(200).default("Untitled document"),
});

export const renameDocumentSchema = z.object({
  title: z.string().min(1).max(200),
});

export const ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;

export const shareSchema = z.object({
  email: z.string().email().max(254),
  // Owner role is assigned only at creation; sharing grants EDITOR or VIEWER.
  role: z.enum(["EDITOR", "VIEWER"]),
});

export const createVersionSchema = z.object({
  label: z.string().min(1).max(120),
  // Base64-encoded Yjs update. Hard cap (~4MB of base64 ≈ 3MB binary) guards
  // against a client trying to OOM the server with a giant snapshot.
  snapshot: z.string().min(1).max(4_000_000),
});

// REST fallback for pushing a Yjs update when WebSockets are unavailable.
export const pushUpdateSchema = z.object({
  update: z.string().min(1).max(2_000_000), // base64 Yjs update
});

export const aiAssistSchema = z.object({
  action: z.enum(["summarize", "continue", "fix_grammar", "improve"]),
  text: z.string().min(1).max(20_000),
});

export type ShareInput = z.infer<typeof shareSchema>;
