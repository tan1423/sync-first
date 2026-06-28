import { Version } from "@/lib/models";
import { createVersionSchema } from "@/lib/validation";
import { json, error, parseBody, requireUser, withErrors } from "@/lib/api";
import { requireMembership } from "@/lib/guards";

// GET /api/documents/:id/versions — timeline of snapshots (any member).
export const GET = withErrors(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireMembership(user.sub, id);

  const versions = (await Version.find({ documentId: id })
    .sort({ createdAt: -1 })
    .select("label createdAt createdById")
    .populate("createdById", "name")
    .lean()) as unknown as Array<{
    _id: { toString(): string };
    label: string;
    createdAt: Date;
    createdById: { name: string } | null;
  }>;

  return json({
    versions: versions.map((v) => ({
      id: v._id.toString(),
      label: v.label,
      createdAt: v.createdAt,
      author: v.createdById?.name ?? "Unknown",
    })),
  });
});

// POST /api/documents/:id/versions — capture a snapshot (EDITOR+).
// Snapshot bytes are produced client-side from the live Y.Doc and sent as
// base64; the Zod schema caps its size to prevent OOM via a giant payload.
export const POST = withErrors(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireMembership(user.sub, id, "EDITOR");

  const { label, snapshot } = await parseBody(req, createVersionSchema);
  const bytes = Buffer.from(snapshot, "base64");
  if (bytes.length === 0) return error("Empty snapshot", 400);

  const version = await Version.create({
    documentId: id,
    label,
    snapshot: bytes,
    createdById: user.sub,
  });

  return json(
    { version: { id: version._id.toString(), label: version.label, createdAt: version.createdAt } },
    201,
  );
});
