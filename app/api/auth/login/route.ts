import { User } from "@/lib/models";
import { verifyPassword } from "@/lib/password";
import { signToken, setAuthCookie } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { json, error, parseBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (req) => {
  const { email, password } = await parseBody(req, loginSchema);

  const user = await User.findOne({ email: email.toLowerCase() });
  // Constant-ish message regardless of which half failed (no user enumeration).
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return error("Invalid email or password", 401);
  }

  const id = user._id.toString();
  const token = await signToken({ sub: id, email: user.email, name: user.name });
  await setAuthCookie(token);

  return json({ id, email: user.email, name: user.name });
});
