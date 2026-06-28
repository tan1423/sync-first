// Small helpers for API route handlers: uniform JSON errors, zod parsing, and
// translating AuthzError / auth failures into proper HTTP status codes.
import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { getSession, type SessionClaims } from "./auth";
import { AuthzError } from "./guards";
import { connectDB } from "./db";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Resolve the session or throw a 401 response (caught by withErrors). */
export async function requireUser(): Promise<SessionClaims> {
  const session = await getSession();
  if (!session) throw new AuthzError(401, "Authentication required");
  return session;
}

/** Parse + validate a JSON body against a zod schema. Caps body size. */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  const raw = await req.text();
  // Defence-in-depth: reject absurd bodies before JSON.parse allocates.
  if (raw.length > 5_000_000) throw new AuthzError(413, "Payload too large");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new AuthzError(400, "Invalid JSON");
  }
  return schema.parse(data);
}

/** Wrap a handler so thrown AuthzError / ZodError become clean HTTP responses. */
export function withErrors(
  handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>,
) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      // All API routes touch the DB; ensure a single cached connection is ready.
      await connectDB();
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof AuthzError) return error(err.message, err.status);
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Validation failed", issues: err.issues },
          { status: 422 },
        );
      }
      console.error("[api] unhandled error:", err);
      return error("Internal server error", 500);
    }
  };
}
