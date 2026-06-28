"use client";

import type { SyncStatus } from "@/lib/collab/useCollab";

const MAP: Record<SyncStatus, { label: string; dot: string; help: string }> = {
  offline: {
    label: "Offline",
    dot: "bg-gray-400",
    help: "No network. Your edits are saved locally and will sync on reconnect.",
  },
  connecting: {
    label: "Connecting…",
    dot: "bg-amber-400 animate-pulse",
    help: "Reaching the sync server.",
  },
  connected: {
    label: "Syncing…",
    dot: "bg-blue-500 animate-pulse",
    help: "Connected — reconciling changes.",
  },
  synced: {
    label: "All changes saved",
    dot: "bg-emerald-500",
    help: "Live and in sync with collaborators.",
  },
  local: {
    label: "Local only",
    dot: "bg-orange-400",
    help: "Server unreachable. Editing locally; changes queue for sync.",
  },
};

export function ConnectionStatus({
  status,
  peers,
}: {
  status: SyncStatus;
  peers: number;
}) {
  const s = MAP[status];
  return (
    <div
      className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
      role="status"
      aria-live="polite"
      title={s.help}
    >
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden />
      <span>{s.label}</span>
      {peers > 1 && (
        <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {peers} online
        </span>
      )}
    </div>
  );
}
