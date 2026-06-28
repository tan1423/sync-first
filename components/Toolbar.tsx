"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";

type AiAction = "summarize" | "continue" | "fix_grammar" | "improve";

function Btn({
  active,
  onClick,
  label,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`h-8 min-w-8 rounded px-2 text-sm font-medium transition disabled:opacity-40 ${
        active
          ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
          : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

export function Toolbar({
  editor,
  canWrite,
}: {
  editor: Editor | null;
  canWrite: boolean;
}) {
  const [aiBusy, setAiBusy] = useState<AiAction | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  if (!editor) return null;

  async function runAi(action: AiAction) {
    if (!editor || !canWrite) return;
    setAiError(null);

    const { from, to, empty } = editor.state.selection;
    // For summarize/continue use whole doc; for grammar/improve use selection.
    const useSelection = !empty && (action === "fix_grammar" || action === "improve");
    const text = useSelection
      ? editor.state.doc.textBetween(from, to, "\n")
      : editor.getText();

    if (!text.trim()) {
      setAiError("Nothing to send to AI.");
      return;
    }

    setAiBusy(action);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, text: text.slice(0, 20000) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error ?? "AI request failed");
        return;
      }
      const result: string = data.result ?? "";
      if (!result) return;

      if (action === "continue") {
        editor.chain().focus().insertContentAt(editor.state.doc.content.size, " " + result).run();
      } else if (action === "summarize") {
        editor.chain().focus().insertContentAt(0, `Summary: ${result}\n\n`).run();
      } else if (useSelection) {
        editor.chain().focus().insertContentAt({ from, to }, result).run();
      } else {
        editor.chain().focus().insertContent(result).run();
      }
    } catch {
      setAiError("Network error contacting AI.");
    } finally {
      setAiBusy(null);
    }
  }

  return (
    <div className="space-y-1">
      <div
        className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900"
        role="toolbar"
        aria-label="Formatting"
      >
        <Btn label="Bold" active={editor.isActive("bold")} disabled={!canWrite} onClick={() => editor.chain().focus().toggleBold().run()}>
          <b>B</b>
        </Btn>
        <Btn label="Italic" active={editor.isActive("italic")} disabled={!canWrite} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <i>I</i>
        </Btn>
        <Btn label="Strikethrough" active={editor.isActive("strike")} disabled={!canWrite} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <s>S</s>
        </Btn>
        <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" aria-hidden />
        <Btn label="Heading 1" active={editor.isActive("heading", { level: 1 })} disabled={!canWrite} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          H1
        </Btn>
        <Btn label="Heading 2" active={editor.isActive("heading", { level: 2 })} disabled={!canWrite} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </Btn>
        <Btn label="Bullet list" active={editor.isActive("bulletList")} disabled={!canWrite} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          • List
        </Btn>
        <Btn label="Ordered list" active={editor.isActive("orderedList")} disabled={!canWrite} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1. List
        </Btn>
        <Btn label="Quote" active={editor.isActive("blockquote")} disabled={!canWrite} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          ❝
        </Btn>
        <Btn label="Code block" active={editor.isActive("codeBlock")} disabled={!canWrite} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          {"</>"}
        </Btn>

        {canWrite && (
          <>
            <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" aria-hidden />
            <span className="px-1 text-xs font-semibold uppercase tracking-wide text-violet-500">AI</span>
            {(["summarize", "continue", "fix_grammar", "improve"] as AiAction[]).map((a) => (
              <Btn key={a} label={`AI: ${a.replace("_", " ")}`} disabled={!!aiBusy} onClick={() => runAi(a)}>
                {aiBusy === a ? "…" : a === "fix_grammar" ? "Grammar" : a === "continue" ? "Continue" : a[0].toUpperCase() + a.slice(1)}
              </Btn>
            ))}
          </>
        )}
      </div>
      {aiError && <p className="px-1 text-xs text-red-500">{aiError}</p>}
    </div>
  );
}
