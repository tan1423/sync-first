import { User, Member } from "@/lib/models";
import { shareSchema } from "@/lib/validation";
import { json, error, parseBody, requireUser, withErrors } from "@/lib/api";
import { requireMembership } from "@/lib/guards";

// POST /api/documents/:id/share — owner grants EDITOR/VIEWER to another user.
export const POST = withErrors(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireMembership(user.sub, id, "OWNER");

  const { email, role } = await parseBody(req, shareSchema);

  const target = await User.findOne({ email: email.toLowerCase() }).lean();
  if (!target) return error("No user with that email exists", 404);
  if (target._id.toString() === user.sub) return error("You already own this document", 400);

  await Member.updateOne(
    { documentId: id, userId: target._id },
    { $set: { role }, $setOnInsert: { documentId: id, userId: target._id } },
    { upsert: true },
  );

  return json({ ok: true, member: { email: target.email, role } });
});

// DELETE /api/documents/:id/share?userId=... — owner revokes access.
export const DELETE = withErrors(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireMembership(user.sub, id, "OWNER");

  const targetId = new URL(req.url).searchParams.get("userId");
  if (!targetId) return error("userId is required", 400);
  if (targetId === user.sub) return error("Owners cannot remove themselves", 400);

  await Member.deleteOne({ documentId: id, userId: targetId });
  return json({ ok: true });
});
