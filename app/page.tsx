import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { APP_NAME } from "@/lib/site";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-4 py-24 text-center">
      <h1 className="text-5xl font-bold tracking-tight">{APP_NAME}</h1>
      <p className="max-w-xl text-lg text-gray-600 dark:text-gray-300">
        A local-first collaborative document editor. Write offline, sync
        automatically, and merge concurrent edits with zero data loss using CRDTs.
      </p>
      <ul className="grid gap-3 text-left text-sm text-gray-600 sm:grid-cols-2 dark:text-gray-400">
        <li className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">⚡ Edit instantly, even fully offline (IndexedDB-first)</li>
        <li className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">🔀 Deterministic conflict-free merging (Yjs CRDT)</li>
        <li className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">🕑 Version history &amp; safe time-travel restore</li>
        <li className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">👥 Owner / Editor / Viewer roles, real-time presence</li>
      </ul>
      <div className="flex gap-3">
        <Link
          href="/register"
          className="rounded-lg bg-gray-900 px-5 py-2.5 font-medium text-white dark:bg-white dark:text-gray-900"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium dark:border-gray-700"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
