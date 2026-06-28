import { getSession } from "@/lib/auth";
import { signToken } from "@/lib/jwt";
import { json, error } from "@/lib/api";

// GET /api/realtime-token — issues a short-lived (1h) JWT the browser passes to
// the WebSocket sync server as ?token=. This keeps realtime auth working even
// when the sync server is on a different domain in production (where the
// httpOnly cookie would not be sent cross-site), and limits token exposure.
export async function GET() {
  const session = await getSession();
  if (!session) return error("Authentication required", 401);

  const token = await signToken(
    { sub: session.sub, email: session.email, name: session.name },
    "1h",
  );
  return json({ token });
}
