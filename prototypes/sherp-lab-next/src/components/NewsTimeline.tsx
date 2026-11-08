"use client";

import { useMemo, useState } from "react";
import { newsItems, newsKindLabels, type NewsKind } from "@/content/news";

const filters: Array<NewsKind | "all"> = [
  "all",
  "milestone",
  "conference",
  "award",
  "event",
  "upcoming",
];

export function NewsTimeline() {
  const [filter, setFilter] = useState<NewsKind | "all">("all");

  const sorted = useMemo(
    () => [...newsItems].sort((a, b) => b.date.localeCompare(a.date)),
    [],
  );

  const items = useMemo(
    () => (filter === "all" ? sorted : sorted.filter((n) => n.kind === filter)),
    [filter, sorted],
  );

  const upcoming = sorted.filter((n) => n.kind === "upcoming");

  return (
    <>
      {upcoming.length > 0 ? (
        <section className="mb-12 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <h2 className="font-display text-lg font-semibold text-amber-100">Upcoming</h2>
          <ul className="mt-4 space-y-3">
            {upcoming.map((item) => (
              <li key={item.date + item.title} className="text-sm text-zinc-300">
                <time className="text-amber-200/80">{item.date}</time> — {item.title}
                {item.location ? (
                  <span className="text-zinc-500"> · {item.location}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide transition ${
              filter === f
                ? "bg-teal-500/20 text-teal-200"
                : "bg-white/5 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {f === "all" ? "All" : newsKindLabels[f]}
          </button>
        ))}
      </div>

      <ol className="relative mt-10 space-y-0 border-l border-teal-500/20 pl-8">
        {items.map((item) => (
          <li key={item.date + item.title} className="relative pb-10">
            <span className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-teal-400 bg-[#070b12]" />
            <time className="text-xs font-semibold uppercase tracking-wide text-teal-400/80">
              {item.date}
            </time>
            <span className="ml-3 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase text-zinc-500">
              {newsKindLabels[item.kind]}
            </span>
            <h2 className="font-display mt-2 text-xl font-semibold text-zinc-100">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">{item.body}</p>
            {item.location ? (
              <p className="mt-1 text-xs text-zinc-600">{item.location}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </>
  );
}
