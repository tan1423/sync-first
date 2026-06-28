import { getSession } from "@/lib/auth";
import { json } from "@/lib/api";

export async function GET() {
  const session = await getSession();
  if (!session) return json({ user: null });
  return json({ user: { id: session.sub, email: session.email, name: session.name } });
}
