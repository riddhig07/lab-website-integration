"use client";

import { useEffect, useState } from "react";
import { DriveExplorer } from "@/components/DriveExplorer";

type Status = {
  driveConfigured: boolean;
  openaiConfigured: boolean;
  sync: { status: string; lastSyncAt?: string; lastSyncError?: string; documentCount: number };
};

export function LabDriveHub() {
  const [status, setStatus] = useState<Status | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ name: string; folderPath: string; webViewLink?: string }[]>([]);

  async function refreshStatus() {
    const res = await fetch("/api/meeting-hub/status");
    setStatus(await res.json());
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  async function syncNow() {
    setSyncing(true);
    await fetch("/api/meeting-hub/sync", { method: "POST" });
    await refreshStatus();
    setSyncing(false);
  }

  async function search() {
    const res = await fetch(`/api/meeting-hub/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setResults(data.results ?? []);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold text-white">Synchronization</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {status?.driveConfigured
                ? "Google Drive connected (service account or OAuth)."
                : "Demo mode — configure credentials for live Drive sync."}
            </p>
            {status?.sync ? (
              <p className="mt-2 text-xs text-zinc-600">
                Status: {status.sync.status} · {status.sync.documentCount} indexed · Last:{" "}
                {status.sync.lastSyncAt ?? "never"}
              </p>
            ) : null}
            {status?.sync.lastSyncError ? (
              <p className="mt-1 text-xs text-red-400">{status.sync.lastSyncError}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-[#042f2e] disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <h2 className="font-display font-semibold text-white">Search indexed documents</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, keyword, project…"
            className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={search}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-zinc-200"
          >
            Search
          </button>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {results.map((r) => (
            <li key={r.name + r.folderPath} className="rounded-lg border border-white/6 px-3 py-2">
              <p className="text-zinc-200">{r.name}</p>
              <p className="text-xs text-zinc-600">{r.folderPath}</p>
              {r.webViewLink ? (
                <a href={r.webViewLink} target="_blank" rel="noreferrer" className="text-xs text-teal-300">
                  Open in Drive →
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <DriveExplorer />
    </div>
  );
}
