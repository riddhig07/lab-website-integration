"use client";

import { useState } from "react";

type Source = { title: string; meetingId?: string; driveFileId?: string };

export function ResearchAssistant() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!question.trim()) return;
    setLoading(true);
    const res = await fetch("/api/ai/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = (await res.json()) as { answer: string; sources: Source[] };
    setAnswer(data.answer);
    setSources(data.sources ?? []);
    setLoading(false);
  }

  return (
    <section className="rounded-2xl border border-teal-500/15 bg-teal-500/5 p-6">
      <h2 className="font-display text-lg font-semibold text-teal-100">AI research assistant</h2>
      <p className="mt-2 text-sm text-zinc-500">
        Answers use indexed meeting notes and Drive text — with source citations.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What did we decide about…"
          className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={loading}
          onClick={ask}
          className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-[#042f2e] disabled:opacity-50"
        >
          {loading ? "Searching…" : "Ask"}
        </button>
      </div>
      {answer ? (
        <div className="mt-4 rounded-xl bg-black/30 p-4 text-sm leading-relaxed text-zinc-300">
          {answer}
          {sources.length > 0 ? (
            <ul className="mt-4 border-t border-white/10 pt-3 text-xs text-zinc-500">
              {sources.map((s) => (
                <li key={s.title + (s.meetingId ?? s.driveFileId)}>
                  Source: {s.title}
                  {s.meetingId ? ` · meeting ${s.meetingId}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
