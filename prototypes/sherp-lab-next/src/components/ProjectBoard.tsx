"use client";

import { useEffect, useState } from "react";
import { lab } from "@/content/site";

type Card = { id: string; title: string; column: string };

const DEFAULT_COLUMNS = [
  "Experiments",
  "Grant writing",
  "Publication pipeline",
  "Assignments",
  "Done",
] as const;

const DEFAULT_CARDS: Card[] = [
  { id: "1", title: "URV spline demo tuning", column: "Experiments" },
  { id: "2", title: "Platform odometry baselines", column: "Experiments" },
  { id: "3", title: "NSF broader impacts paragraph", column: "Grant writing" },
  { id: "4", title: "Literature review merge → arXiv", column: "Publication pipeline" },
  { id: "5", title: "Benchmark spec v0.2", column: "Publication pipeline" },
  { id: "6", title: "Riddhi — Drive + Git intranet", column: "Assignments" },
  { id: "7", title: "Fall kickoff notes archived", column: "Done" },
];

const STORAGE_KEY = "sherp-project-board";

export function ProjectBoard() {
  const [cards, setCards] = useState<Card[]>(DEFAULT_CARDS);
  const [draft, setDraft] = useState("");
  const [column, setColumn] = useState<string>(DEFAULT_COLUMNS[0]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCards(JSON.parse(raw) as Card[]);
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  }, [cards]);

  function moveCard(id: string, nextColumn: string) {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, column: nextColumn } : c)),
    );
  }

  function addCard() {
    const title = draft.trim();
    if (!title) return;
    setCards((prev) => [
      ...prev,
      { id: String(Date.now()), title, column },
    ]);
    setDraft("");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <a
          href={lab.links.github}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-teal-300 hover:border-teal-500/30"
        >
          GitHub (live activity below) →
        </a>
        <a
          href={lab.links.notion}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-teal-300"
        >
          Notion workspace →
        </a>
        <a
          href={lab.links.trello}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-teal-300"
        >
          Trello board →
        </a>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New task…"
          className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/30"
        />
        <select
          value={column}
          onChange={(e) => setColumn(e.target.value)}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
        >
          {DEFAULT_COLUMNS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addCard}
          className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-[#042f2e]"
        >
          Add
        </button>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-5">
        {DEFAULT_COLUMNS.map((col) => (
          <section
            key={col}
            className="rounded-2xl border border-white/8 bg-white/[0.02] p-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/plain");
              if (id) moveCard(id, col);
            }}
          >
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {col}
            </h2>
            <ul className="mt-3 space-y-2">
              {cards
                .filter((c) => c.column === col)
                .map((c) => (
                  <li
                    key={c.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                    className="cursor-grab rounded-lg border border-white/6 bg-black/25 px-3 py-2 text-sm text-zinc-300 active:cursor-grabbing"
                  >
                    {c.title}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
