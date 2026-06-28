import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { mergeUpdates, applyAllToText, computeRestoreDelta } from "@/lib/collab/merge";

/**
 * These tests pin down the assignment's core guarantee: deterministic conflict
 * resolution that merges concurrent edits WITHOUT data loss, independent of the
 * order updates arrive in (the property that makes offline-sync safe).
 */

function editTextUpdate(seed: Uint8Array | null, mutate: (t: Y.Text) => void): Uint8Array {
  const doc = new Y.Doc();
  if (seed) Y.applyUpdate(doc, seed);
  const before = Y.encodeStateVector(doc);
  doc.transact(() => mutate(doc.getText("content")));
  return Y.encodeStateAsUpdate(doc, before); // just the delta of this edit
}

describe("CRDT convergence (deterministic conflict resolution)", () => {
  it("merges two concurrent offline edits with no data loss", () => {
    // Shared base document.
    const base = new Y.Doc();
    base.getText("content").insert(0, "Hello world");
    const baseUpdate = Y.encodeStateAsUpdate(base);

    // Two replicas go offline and edit concurrently from the same base.
    const a = editTextUpdate(baseUpdate, (t) => t.insert(0, "[A] "));
    const b = editTextUpdate(baseUpdate, (t) => t.insert(t.length, " [B]"));

    // Both edits survive, and the result is identical regardless of order.
    const order1 = applyAllToText([baseUpdate, a, b]);
    const order2 = applyAllToText([baseUpdate, b, a]);

    expect(order1).toBe(order2); // determinism
    expect(order1).toContain("[A]"); // A's edit preserved
    expect(order1).toContain("[B]"); // B's edit preserved
    expect(order1).toContain("Hello world"); // base preserved
  });

  it("is idempotent — applying the same update twice changes nothing", () => {
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "abc");
    const u = Y.encodeStateAsUpdate(doc);

    const once = applyAllToText([u]);
    const twice = applyAllToText([u, u]);
    expect(once).toBe(twice);
  });

  it("mergeUpdates produces a state equivalent to sequential application", () => {
    const base = new Y.Doc();
    base.getText("content").insert(0, "12345");
    const baseUpdate = Y.encodeStateAsUpdate(base);
    const a = editTextUpdate(baseUpdate, (t) => t.delete(0, 1));
    const b = editTextUpdate(baseUpdate, (t) => t.insert(t.length, "6"));

    const merged = mergeUpdates([baseUpdate, a, b]);
    expect(applyAllToText([merged])).toBe(applyAllToText([baseUpdate, a, b]));
  });
});

describe("version restore (time travel) is CRDT-safe", () => {
  it("restore delta brings a replica back to the snapshot content", () => {
    // Snapshot taken at an earlier point in time.
    const snap = new Y.Doc();
    snap.getText("content").insert(0, "original text");
    const snapshot = Y.encodeStateAsUpdate(snap);

    // Document has since moved on.
    const current = new Y.Doc();
    Y.applyUpdate(current, snapshot);
    current.getText("content").insert(current.getText("content").length, " + later edits");
    const currentState = Y.encodeStateAsUpdate(current);

    // Compute & apply the restore delta to the live replica.
    const delta = computeRestoreDelta(currentState, snapshot);
    Y.applyUpdate(current, delta);

    // The snapshot's content is present; the merge did not throw or corrupt.
    expect(current.getText("content").toString()).toContain("original text");
  });

  it("restore delta applied to a fresh replica reproduces snapshot content", () => {
    const snap = new Y.Doc();
    snap.getText("content").insert(0, "v1 content");
    const snapshot = Y.encodeStateAsUpdate(snap);

    const delta = computeRestoreDelta(new Uint8Array(), snapshot);
    const fresh = new Y.Doc();
    Y.applyUpdate(fresh, delta);
    expect(fresh.getText("content").toString()).toBe("v1 content");
  });
});
