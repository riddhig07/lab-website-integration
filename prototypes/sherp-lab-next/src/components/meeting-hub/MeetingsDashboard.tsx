"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ResearchAssistant } from "@/components/meeting-hub/ResearchAssistant";
import type { LabMeeting } from "@/lib/meeting-hub/types";

export function MeetingsDashboard() {
  const [meetings, setMeetings] = useState<LabMeeting[]>([]);
  const [month, setMonth] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      await fetch("/api/meeting-hub/sync", { method: "POST" });
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      if (type) params.set("type", type);
      const res = await fetch(`/api/meeting-hub/meetings?${params}`);
      const d = (await res.json()) as { meetings: LabMeeting[] };
      if (!cancelled) setMeetings(d.meetings ?? []);
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [month, type]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return meetings.filter((m) => m.dateKey >= today).slice(0, 8);
  }, [meetings]);

  const past = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return meetings.filter((m) => m.dateKey < today).slice(0, 20);
  }, [meetings]);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap gap-3">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          <option value="monday">Monday</option>
          <option value="thursday">Thursday</option>
        </select>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Loading meetings…</p> : null}

      <section>
        <h2 className="font-display text-lg font-semibold text-white">Upcoming</h2>
        <ul className="mt-4 space-y-3">
          {upcoming.map((m) => (
            <MeetingRow key={m.id} meeting={m} />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-white">History</h2>
        <ul className="mt-4 space-y-3">
          {past.map((m) => (
            <MeetingRow key={m.id} meeting={m} />
          ))}
        </ul>
      </section>

      <ResearchAssistant />
    </div>
  );
}

function MeetingRow({ meeting: m }: { meeting: LabMeeting }) {
  const actionCount = m.summary?.actionItems?.length ?? 0;
  return (
    <li className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 transition hover:border-teal-500/25">
      <Link href={`/meetings/${m.id}`} className="block">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium text-zinc-100">{m.title}</p>
            <p className="text-xs text-zinc-500">
              {m.dateKey} · {m.type === "monday" ? "Mon" : "Thu"} · {m.linkedDriveFileIds.length}{" "}
              docs
            </p>
          </div>
          <div className="flex gap-2 text-[10px] uppercase tracking-wide">
            {m.recording ? (
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-violet-200">
                Recording
              </span>
            ) : null}
            {actionCount > 0 ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-200">
                {actionCount} actions
              </span>
            ) : null}
          </div>
        </div>
        {m.agendaPreview ? (
          <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{m.agendaPreview}</p>
        ) : null}
        {m.summary?.overview ? (
          <p className="mt-2 line-clamp-2 text-sm text-teal-200/80">{m.summary.overview}</p>
        ) : null}
      </Link>
    </li>
  );
}
