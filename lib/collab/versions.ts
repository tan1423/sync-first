"use client";

import * as Y from "yjs";
import { yDocToProsemirrorJSON } from "y-prosemirror";
import type { Editor } from "@tiptap/react";
import { bytesToBase64, base64ToBytes } from "@/lib/base64";

// Tiptap's Collaboration extension binds to this Y.XmlFragment field name.
export const COLLAB_FIELD = "default";

/** Encode the current document state as a base64 snapshot for the server. */
export function captureSnapshot(doc: Y.Doc): string {
  const update = Y.encodeStateAsUpdate(doc);
  return bytesToBase64(update);
}

/**
 * Restore a snapshot SAFELY for live collaborators.
 *
 * We do NOT overwrite the shared Y.Doc out-of-band. Instead we decode the
 * snapshot into ProseMirror JSON and apply it through the editor, so the change
 * flows through the normal CRDT pipeline: it becomes a set of Yjs operations
 * that merge and propagate to every connected peer. Nobody's live state is
 * destroyed; all replicas converge to the restored content.
 */
export function restoreSnapshot(editor: Editor, snapshotBase64: string): void {
  const bytes = base64ToBytes(snapshotBase64);
  const snapDoc = new Y.Doc();
  Y.applyUpdate(snapDoc, bytes);

  const json = yDocToProsemirrorJSON(snapDoc, COLLAB_FIELD);
  // emitUpdate:true so the collaboration binding turns this into CRDT ops.
  editor.commands.setContent(json, { emitUpdate: true });
  snapDoc.destroy();
}
