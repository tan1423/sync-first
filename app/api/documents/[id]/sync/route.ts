import { json, parseBody, requireUser, withErrors } from "@/lib/api";
import { requireMembership } from "@/lib/guards";
import { pushUpdateSchema } from "@/lib/validation";
import { applyUpdate, getStateUpdate } from "@/lib/yjs-persistence";

// GET /api/documents/:id/sync — bootstrap: current merged state as base64.
// Lets a fresh client paint server state even if the WebSocket is unavailable.
export const GET = withErrors(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireMembership(user.sub, id);

  const update = await getStateUpdate(id);
  return json({ update: Buffer.from(update).toString("base64") });
});

// POST /api/documents/:id/sync — REST fallback push (EDITOR+).
// Strictly validated: viewers are blocked by role, payload size is capped by
// the Zod schema, and a non-parseable update is rejected before it can corrupt
// the stored document.
export const POST = withErrors(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireMembership(user.sub, id, "EDITOR");

  const { update } = await parseBody(req, pushUpdateSchema);
  const bytes = new Uint8Array(Buffer.from(update, "base64"));

  try {
    await applyUpdate(id, bytes);
  } catch {
    // Malformed Yjs update — reject rather than persisting garbage.
    return json({ error: "Invalid document update" }, 400);
  }

  return json({ ok: true });
});
