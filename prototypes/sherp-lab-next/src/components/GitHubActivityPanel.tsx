"use client";

import { useEffect, useState } from "react";

type EventRow = { id: string; type: string; repo: string; createdAt: string };

export function GitHubActivityPanel() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/github/activity")
      .then((r) => r.json())
      .then((data: { events?: EventRow[]; message?: string; error?: string }) => {
        setEvents(data.events ?? []);
        setMessage(data.message ?? data.error ?? null);
      })
      .catch(() => setMessage("Could not load GitHub activity."));
  }, []);

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <h2 className="font-display text-lg font-semibold text-zinc-100">GitHub activity</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Tracks pushes and PRs — configure GITHUB_ORG or GITHUB_REPO (+ optional GITHUB_TOKEN).
      </p>
      {message ? <p className="mt-3 text-sm text-amber-200/90">{message}</p> : null}
      <ul className="mt-4 space-y-2 text-sm">
        {events.length === 0 && !message ? (
          <li className="text-zinc-600">Loading…</li>
        ) : null}
        {events.map((e) => (
          <li key={e.id} className="rounded-lg border border-white/6 px-3 py-2 text-zinc-400">
            <span className="text-teal-300">{e.type}</span> · {e.repo}
            <time className="ml-2 text-xs text-zinc-600">
              {new Date(e.createdAt).toLocaleDateString()}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
