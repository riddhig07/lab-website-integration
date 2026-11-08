"use client";

import { useEffect, useState } from "react";

type MeetingNote = {
  id: string;
  date: string;
  title: string;
  agenda: string;
  decisions: string;
  transcript?: string;
};

const SEED: MeetingNote[] = [
  {
    id: "m1",
    date: "2026-10-12",
    title: "Weekly sync + benchmark expansion",
    agenda: "Review environment ideas doc; assign LLM runtime sheet owners.",
    decisions: "Proceed with object set v1 photo hash in SOP.",
  },
  {
    id: "m2",
    date: "2026-10-05",
    title: "Platform research check-in",
    agenda: "JetRacer vs HiWonder tradeoffs; Orin Nano availability.",
    decisions: "Order second depth camera for HiWonder top.",
  },
  {
    id: "m3",
    date: "2026-10-01",
    title: "Fall kickoff",
    agenda: "Website planning, literature cadence, safety walkthrough.",
    decisions: "Weekly syncs Tuesdays; intranet password before public launch.",
  },
];

const KEY = "sherp-meetings";

export function MeetingHub() {
  const [notes, setNotes] = useState<MeetingNote[]>(SEED);
  const [activeId, setActiveId] = useState(SEED[0].id);
  const [transcriptDraft, setTranscriptDraft] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setNotes(JSON.parse(raw) as MeetingNote[]);
    } catch {
      /* seed */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(notes));
  }, [notes]);

  const active = notes.find((n) => n.id === activeId) ?? notes[0];

  function saveTranscript() {
    if (!active || !transcriptDraft.trim()) return;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === active.id ? { ...n, transcript: transcriptDraft.trim() } : n,
      ),
    );
    setTranscriptDraft("");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => setActiveId(n.id)}
              className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                n.id === active?.id
                  ? "border-teal-500/40 bg-teal-500/10 text-zinc-100"
                  : "border-white/8 bg-white/[0.02] text-zinc-400 hover:border-white/15"
              }`}
            >
              <time className="text-xs text-zinc-500">{n.date}</time>
              <p className="font-medium">{n.title}</p>
            </button>
          </li>
        ))}
      </ul>

      {active ? (
        <article className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          <h2 className="font-display text-xl font-semibold text-white">{active.title}</h2>
          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase text-zinc-500">Agenda</h3>
            <p className="mt-1 text-sm text-zinc-400">{active.agenda}</p>
          </section>
          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase text-zinc-500">Decisions</h3>
            <p className="mt-1 text-sm text-zinc-400">{active.decisions}</p>
          </section>
          <section className="mt-6">
            <h3 className="text-xs font-semibold uppercase text-zinc-500">
              Integrated AI note-taker & transcription storage
            </h3>
            <p className="mt-1 text-xs text-zinc-600">
              Paste Otter, Fireflies, or Zoom AI companion exports — archived per meeting (browser
              storage today; sync to Drive folder optional).
            </p>
            {active.transcript ? (
              <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-zinc-400 whitespace-pre-wrap">
                {active.transcript}
              </pre>
            ) : null}
            <textarea
              value={transcriptDraft}
              onChange={(e) => setTranscriptDraft(e.target.value)}
              rows={5}
              placeholder="Paste transcript…"
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/30"
            />
            <button
              type="button"
              onClick={saveTranscript}
              className="mt-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-[#042f2e]"
            >
              Store transcript
            </button>
          </section>
        </article>
      ) : null}
    </div>
  );
}
