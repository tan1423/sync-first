// Next.js cookie/session layer on top of the framework-agnostic lib/jwt.ts.
import "server-only";
import { cookies } from "next/headers";
import { AUTH_COOKIE, signToken, verifyToken, type SessionClaims } from "./jwt";

export { AUTH_COOKIE, signToken, verifyToken };
export type { SessionClaims };

/** Read the current session from the request cookies (server components / routes). */
export async function getSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireSession(): Promise<SessionClaims> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

export async function setAuthCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAuthCookie(): Promise<void> {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}
