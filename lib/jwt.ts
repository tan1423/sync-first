// Pure JWT sign/verify with no Next.js dependencies, so it can be imported by
// BOTH the Next app and the standalone Node WebSocket server.
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const SECRET = process.env.JWT_SECRET ?? "";
const secret = new TextEncoder().encode(SECRET);

export const AUTH_COOKIE = "collab_token";

export interface SessionClaims extends JWTPayload {
  sub: string; // userId
  email: string;
  name: string;
}

export async function signToken(
  claims: { sub: string; email: string; name: string },
  expiresIn = process.env.JWT_EXPIRES_IN ?? "7d",
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return payload as SessionClaims;
  } catch {
    return null;
  }
}

/** Minimal cookie parser so the WS server can read the auth cookie from the
 *  handshake request without pulling in a cookie library. */
export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}
