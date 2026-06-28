"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { APP_NAME } from "@/lib/site";

interface DocItem {
  id: string;
  title: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  updatedAt: string;
  versions: number;
  collaborators: number;
}

const ROLE_BADGE: Record<string, string> = {
  OWNER: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  EDITOR: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  VIEWER: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

export function Dashboard({
  user,
  initialDocuments,
}: {
  user: { name: string; email: string };
  initialDocuments: DocItem[];
}) {
  const router = useRouter();
  const [docs] = useState(initialDocuments);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function createDoc(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim() || "Untitled document" }),
      });
      if (res.ok) {
        const { id } = await res.json();
        router.push(`/doc/${id}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{APP_NAME}</h1>
          <p className="text-sm text-gray-500">Signed in as {user.email}</p>
        </div>
        <button
          onClick={logout}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
        >
          Sign out
        </button>
      </header>

      <form onSubmit={createDoc} className="mb-8 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New document title…"
          aria-label="New document title"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-gray-900 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </form>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Your documents
      </h2>

      {docs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700">
          No documents yet. Create your first one above.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {docs.map((d) => (
            <li key={d.id}>
              <Link
                href={`/doc/${d.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 transition hover:border-gray-400 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="font-medium">{d.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[d.role]}`}>
                    {d.role.toLowerCase()}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Updated {new Date(d.updatedAt).toLocaleDateString()} · {d.collaborators} collaborator
                  {d.collaborators !== 1 && "s"} · {d.versions} version{d.versions !== 1 && "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
