import { Version } from "@/lib/models";
import { json, error, requireUser, withErrors } from "@/lib/api";
import { requireMembership } from "@/lib/guards";

// GET /api/documents/:id/versions/:versionId
// Returns the snapshot bytes (base64) so the client can preview or restore it.
// Restore itself happens client-side, applied through the live CRDT so all
// collaborators converge — the server never force-overwrites shared state.
export const GET = withErrors(async (_req, { params }) => {
  const user = await requireUser();
  const { id, versionId } = await params;
  await requireMembership(user.sub, id);

  const version = await Version.findOne({ _id: versionId, documentId: id }).lean();
  if (!version) return error("Version not found", 404);

  return json({
    id: version._id.toString(),
    label: version.label,
    createdAt: version.createdAt,
    snapshot: Buffer.from(version.snapshot as Buffer).toString("base64"),
  });
});
