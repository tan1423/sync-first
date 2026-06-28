import { DocumentModel, Member, Version, DocState } from "@/lib/models";
import { renameDocumentSchema } from "@/lib/validation";
import { json, error, parseBody, requireUser, withErrors } from "@/lib/api";
import { requireMembership } from "@/lib/guards";

// GET /api/documents/:id — document metadata + the caller's role + members.
export const GET = withErrors(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const membership = await requireMembership(user.sub, id);

  const doc = await DocumentModel.findById(id).lean();
  if (!doc) return error("Document not found", 404);

  const members = (await Member.find({ documentId: id })
    .populate("userId", "name email")
    .lean()) as unknown as Array<{
    role: string;
    userId: { _id: { toString(): string }; name: string; email: string };
  }>;

  return json({
    id: doc._id.toString(),
    title: doc.title,
    role: membership.role,
    updatedAt: doc.updatedAt,
    members: members.map((m) => ({
      userId: m.userId._id?.toString(),
      name: m.userId.name,
      email: m.userId.email,
      role: m.role,
    })),
  });
});

// PATCH /api/documents/:id — rename (EDITOR+).
export const PATCH = withErrors(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireMembership(user.sub, id, "EDITOR");
  const { title } = await parseBody(req, renameDocumentSchema);

  await DocumentModel.updateOne({ _id: id }, { $set: { title } });
  return json({ ok: true, title });
});

// DELETE /api/documents/:id — owner only. Manual cascade (no transaction needed).
export const DELETE = withErrors(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireMembership(user.sub, id, "OWNER");

  await Promise.all([
    Member.deleteMany({ documentId: id }),
    Version.deleteMany({ documentId: id }),
    DocState.deleteOne({ documentId: id }),
  ]);
  await DocumentModel.deleteOne({ _id: id });

  return json({ ok: true });
});
