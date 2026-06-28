import { DocumentModel, Member, Version } from "@/lib/models";
import { createDocumentSchema } from "@/lib/validation";
import { json, parseBody, requireUser, withErrors } from "@/lib/api";

// GET /api/documents — list documents the current user is a member of.
export const GET = withErrors(async () => {
  const user = await requireUser();

  const memberships = await Member.find({ userId: user.sub }).lean();
  const docIds = memberships.map((m) => m.documentId);
  if (docIds.length === 0) return json({ documents: [] });

  const [docs, versionCounts, memberCounts] = await Promise.all([
    DocumentModel.find({ _id: { $in: docIds } }).lean(),
    Version.aggregate([
      { $match: { documentId: { $in: docIds } } },
      { $group: { _id: "$documentId", n: { $sum: 1 } } },
    ]),
    Member.aggregate([
      { $match: { documentId: { $in: docIds } } },
      { $group: { _id: "$documentId", n: { $sum: 1 } } },
    ]),
  ]);

  const roleByDoc = new Map(memberships.map((m) => [m.documentId.toString(), m.role]));
  const vCount = new Map(versionCounts.map((c) => [c._id.toString(), c.n]));
  const mCount = new Map(memberCounts.map((c) => [c._id.toString(), c.n]));

  const documents = docs
    .map((d) => {
      const id = d._id.toString();
      return {
        id,
        title: d.title,
        role: roleByDoc.get(id) ?? "VIEWER",
        updatedAt: d.updatedAt,
        versions: vCount.get(id) ?? 0,
        collaborators: mCount.get(id) ?? 0,
      };
    })
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));

  return json({ documents });
});

// POST /api/documents — create a document; creator becomes OWNER.
// Two sequential writes (no transaction) so this works on standalone MongoDB.
export const POST = withErrors(async (req) => {
  const user = await requireUser();
  const { title } = await parseBody(req, createDocumentSchema);

  const doc = await DocumentModel.create({ title });
  try {
    await Member.create({ documentId: doc._id, userId: user.sub, role: "OWNER" });
  } catch (err) {
    // Roll back the orphaned document if membership creation fails.
    await DocumentModel.deleteOne({ _id: doc._id }).catch(() => {});
    throw err;
  }

  return json({ id: doc._id.toString(), title: doc.title }, 201);
});
