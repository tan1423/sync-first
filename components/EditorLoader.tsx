"use client";

import dynamic from "next/dynamic";

// The Tiptap + Yjs collaboration stack touches browser-only APIs (IndexedDB,
// WebSocket) and is not server-renderable. Loading it with ssr:false ensures
// the whole editor module graph only ever evaluates in the browser, which also
// avoids Turbopack server-module-evaluation issues with the y-* packages.
const Editor = dynamic(() => import("./Editor").then((m) => m.Editor), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-gray-400">
      Loading editor…
    </div>
  ),
});

interface Member {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
}

export function EditorLoader(props: {
  documentId: string;
  initialTitle: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  me: { id: string; name: string };
  members: Member[];
}) {
  return <Editor {...props} />;
}
