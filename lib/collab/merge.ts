// Pure, isomorphic CRDT helpers — no DB, no DOM. These encapsulate the core
// "deterministic conflict resolution" guarantees and are exercised by the unit
// tests in __tests__/merge.test.ts.
import * as Y from "yjs";

/** Merge a set of Yjs updates into one compacted update. Order-independent. */
export function mergeUpdates(updates: Uint8Array[]): Uint8Array {
  return Y.mergeUpdates(updates);
}

/**
 * Apply two updates to a doc in the given order and return the resulting text
 * of the named shared type. Used by tests to prove convergence regardless of
 * apply order (the CRDT property the assignment hinges on).
 */
export function applyAllToText(updates: Uint8Array[], key = "content"): string {
  const doc = new Y.Doc();
  for (const u of updates) Y.applyUpdate(doc, u);
  return doc.getText(key).toString();
}

/**
 * Compute the delta needed to bring a replica (described by `currentState`,
 * an encoded update) up to the content contained in `snapshot`. Applying this
 * delta is how a version restore propagates through the live CRDT without
 * overwriting anyone's state.
 */
export function computeRestoreDelta(
  currentState: Uint8Array,
  snapshot: Uint8Array,
): Uint8Array {
  const current = new Y.Doc();
  if (currentState.length) Y.applyUpdate(current, currentState);
  const snap = new Y.Doc();
  Y.applyUpdate(snap, snapshot);

  const currentSV = Y.encodeStateVector(current);
  return Y.encodeStateAsUpdate(snap, currentSV);
}
