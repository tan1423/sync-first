import { clearAuthCookie } from "@/lib/auth";
import { json, withErrors } from "@/lib/api";

export const POST = withErrors(async () => {
  await clearAuthCookie();
  return json({ ok: true });
});
