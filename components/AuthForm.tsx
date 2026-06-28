"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(form.entries());

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-20">
      <h1 className="text-2xl font-bold">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>

      <form onSubmit={onSubmit} className="space-y-3">
        {mode === "register" && (
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">Name</label>
            <input id="name" name="name" required maxLength={80} autoComplete="name"
              className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800" />
          </div>
        )}
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email"
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800" />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
          <input id="password" name="password" type="password" required minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800" />
          {mode === "register" && (
            <p className="mt-1 text-xs text-gray-500">At least 8 characters.</p>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy}
          className="w-full rounded-md bg-gray-900 px-4 py-2.5 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="text-sm text-gray-600 dark:text-gray-400">
        {mode === "login" ? (
          <>No account? <Link href="/register" className="font-medium underline">Register</Link></>
        ) : (
          <>Already have an account? <Link href="/login" className="font-medium underline">Sign in</Link></>
        )}
      </p>
    </main>
  );
}
