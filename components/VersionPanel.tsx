"use client";

import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import type * as Y from "yjs";
import { captureSnapshot, restoreSnapshot } from "@/lib/collab/versions";

interface VersionMeta {
  id: string;
  label: string;
  createdAt: string;
  author: string;
}

export function VersionPanel({
  documentId,
  doc,
  editor,
  canWrite,
}: {
  documentId: string;
  doc: Y.Doc;
  editor: Editor | null;
  canWrite: boolean;
}) {
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  // Starts true: avoids a synchronous setState(true) inside the mount effect.
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`);
      if (res.ok) setVersions((await res.json()).versions);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function snapshot() {
    setBusy(true);
    setMsg(null);
    try {
      const label = `Snapshot ${new Date().toLocaleString()}`;
      const res = await fetch(`/api/documents/${documentId}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, snapshot: captureSnapshot(doc) }),
      });
      if (!res.ok) {
        setMsg("Could not save version.");
        return;
      }
      setMsg("Version saved.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function restore(id: string) {
    if (!editor) return;
    if (!confirm("Restore this version? Current content will be replaced for everyone (it merges through CRDT, nothing is lost from history).")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions/${id}`);
      if (!res.ok) {
        setMsg("Could not load version.");
        return;
      }
      const data = await res.json();
      restoreSnapshot(editor, data.snapshot);
      setMsg("Restored. Change is syncing to collaborators.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex w-full flex-col rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 p-3 dark:border-gray-800">
        <h2 className="text-sm font-semibold">Version history</h2>
        {canWrite && (
          <button
            type="button"
            onClick={snapshot}
            disabled={busy}
            className="rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
          >
            {busy ? "…" : "Capture"}
          </button>
        )}
      </div>

      {msg && <p className="px-3 pt-2 text-xs text-emerald-600 dark:text-emerald-400">{msg}</p>}

      <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
        {loading && <li className="p-3 text-xs text-gray-500">Loading…</li>}
        {!loading && versions.length === 0 && (
          <li className="p-3 text-xs text-gray-500">No snapshots yet. Capture one to start your timeline.</li>
        )}
        {versions.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm">{v.label}</p>
              <p className="text-xs text-gray-500">
                {new Date(v.createdAt).toLocaleString()} · {v.author}
              </p>
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={() => restore(v.id)}
                disabled={busy}
                className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Restore
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
