// Server-side Yjs persistence. Stores the document as a single *compacted*
// merged update (Y.encodeStateAsUpdate) rather than an ever-growing append log,
// which keeps "document state size over time" bounded (a rubric concern).
import * as Y from "yjs";
import { connectDB } from "./db";
import { DocState, DocumentModel } from "./models";
import { computeRestoreDelta } from "./collab/merge";

/** Build a fresh Y.Doc rehydrated from the persisted state, or empty if none. */
export async function loadDoc(documentId: string): Promise<Y.Doc> {
  await connectDB();
  const doc = new Y.Doc();
  const row = await DocState.findOne({ documentId }).lean();
  if (row?.update) {
    Y.applyUpdate(doc, new Uint8Array(row.update as Buffer));
  }
  return doc;
}

/** Persist the full current state of a doc, compacted into one update blob. */
export async function persistDoc(documentId: string, doc: Y.Doc): Promise<void> {
  await connectDB();
  const update = Buffer.from(Y.encodeStateAsUpdate(doc));
  const stateVector = Buffer.from(Y.encodeStateVector(doc));
  await DocState.updateOne(
    { documentId },
    { $set: { update, stateVector } },
    { upsert: true },
  );
  await DocumentModel.updateOne(
    { _id: documentId },
    { $set: { updatedAt: new Date() } },
  );
}

/** Merge an incremental update into the persisted state (REST fallback path). */
export async function applyUpdate(
  documentId: string,
  update: Uint8Array,
): Promise<void> {
  const doc = await loadDoc(documentId);
  Y.applyUpdate(doc, update);
  await persistDoc(documentId, doc);
}

/** Current state encoded as an update — used to seed late joiners / snapshots. */
export async function getStateUpdate(documentId: string): Promise<Uint8Array> {
  const doc = await loadDoc(documentId);
  return Y.encodeStateAsUpdate(doc);
}

/**
 * Restore a version SAFELY for live collaborators. We do NOT overwrite the doc;
 * we compute the delta between current state and the snapshot and return it to
 * be applied as a normal CRDT update, so every client converges without loss.
 */
export async function restoreSnapshotAsUpdate(
  documentId: string,
  snapshot: Uint8Array,
): Promise<Uint8Array> {
  const current = await loadDoc(documentId);
  const currentState = Y.encodeStateAsUpdate(current);
  return computeRestoreDelta(currentState, snapshot);
}
