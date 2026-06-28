"use client";

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { useCollab } from "@/lib/collab/useCollab";
import { COLLAB_FIELD } from "@/lib/collab/versions";
import { colorForId } from "@/lib/colors";
import { ConnectionStatus } from "./ConnectionStatus";
import { Toolbar } from "./Toolbar";
import { VersionPanel } from "./VersionPanel";
import { SharePanel } from "./SharePanel";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
}

export function Editor({
  documentId,
  initialTitle,
  role,
  me,
  members,
}: {
  documentId: string;
  initialTitle: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  me: { id: string; name: string };
  members: Member[];
}) {
  const canWrite = role === "OWNER" || role === "EDITOR";
  const color = colorForId(me.id);

  const { doc, provider, status, localLoaded, peers } = useCollab(
    documentId,
    { name: me.name, color },
    canWrite,
  );

  const [title, setTitle] = useState(initialTitle);

  const editor = useEditor(
    {
      editable: canWrite,
      immediatelyRender: false,
      extensions: [
        // Yjs owns history; disable StarterKit's own undo/redo to avoid conflicts.
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document: doc, field: COLLAB_FIELD }),
        ...(provider
          ? [
              CollaborationCaret.configure({
                provider,
                user: { name: me.name, color },
              }),
            ]
          : []),
      ],
      editorProps: {
        attributes: {
          class:
            "prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[60vh] dark:prose-invert",
          "aria-label": "Document editor",
          role: "textbox",
          "aria-multiline": "true",
        },
      },
    },
    [provider, canWrite, doc],
  );

  async function saveTitle() {
    if (!canWrite) return;
    await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[1fr_300px]">
      {/* Main column */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            disabled={!canWrite}
            aria-label="Document title"
            className="min-w-0 flex-1 bg-transparent text-2xl font-bold outline-none disabled:opacity-80"
          />
          <div className="flex items-center gap-3">
            {!canWrite && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                View only
              </span>
            )}
            <ConnectionStatus status={status} peers={peers} />
          </div>
        </div>

        <Toolbar editor={editor} canWrite={canWrite} />

        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          {!localLoaded && (
            <p className="text-sm text-gray-400">Loading your local copy…</p>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <SharePanel
          documentId={documentId}
          initialMembers={members}
          isOwner={role === "OWNER"}
          meId={me.id}
        />
        <VersionPanel
          documentId={documentId}
          doc={doc}
          editor={editor}
          canWrite={canWrite}
        />
      </div>
    </div>
  );
}
