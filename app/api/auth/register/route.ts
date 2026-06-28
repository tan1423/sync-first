import { User } from "@/lib/models";
import { hashPassword } from "@/lib/password";
import { signToken, setAuthCookie } from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { json, error, parseBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (req) => {
  const { email, name, password } = await parseBody(req, registerSchema);

  const existing = await User.findOne({ email: email.toLowerCase() }).lean();
  if (existing) return error("An account with that email already exists", 409);

  const user = await User.create({
    email,
    name,
    passwordHash: await hashPassword(password),
  });

  const id = user._id.toString();
  const token = await signToken({ sub: id, email: user.email, name: user.name });
  await setAuthCookie(token);

  return json({ id, email: user.email, name: user.name }, 201);
});
