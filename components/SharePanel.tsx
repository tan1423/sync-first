"use client";

import { useState } from "react";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
}

export function SharePanel({
  documentId,
  initialMembers,
  isOwner,
  meId,
}: {
  documentId: string;
  initialMembers: Member[];
  isOwner: boolean;
  meId: string;
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"EDITOR" | "VIEWER">("VIEWER");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/documents/${documentId}`);
    if (res.ok) setMembers((await res.json()).members);
  }

  async function share(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Could not share.");
        return;
      }
      setEmail("");
      setMsg(`Shared with ${data.member.email} as ${data.member.role}.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(userId: string) {
    setBusy(true);
    try {
      await fetch(`/api/documents/${documentId}/share?userId=${userId}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-2 text-sm font-semibold">Collaborators</h2>

      <ul className="mb-3 space-y-1">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              {m.name}
              {m.userId === meId && " (you)"}
              <span className="ml-1 text-xs text-gray-500">· {m.role.toLowerCase()}</span>
            </span>
            {isOwner && m.role !== "OWNER" && (
              <button
                type="button"
                onClick={() => revoke(m.userId)}
                disabled={busy}
                className="text-xs text-red-500 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <form onSubmit={share} className="space-y-2">
          <input
            type="email"
            required
            placeholder="teammate@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Collaborator email"
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
          <div className="flex gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "EDITOR" | "VIEWER")}
              aria-label="Role"
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
            >
              Share
            </button>
          </div>
        </form>
      )}
      {msg && <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{msg}</p>}
    </section>
  );
}
