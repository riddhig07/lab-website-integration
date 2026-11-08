"use client";

import { useEffect, useMemo, useState } from "react";
import {
  researchQuestions,
  seedPapers,
  type PaperNode,
} from "@/content/literature-graph";
import { expandCitations, type ParseResult } from "@/lib/parse-literature";

const STORAGE_KEY = "sherp-literature-papers";

function saveCustom(papers: PaperNode[]) {
  const custom = papers.filter((p) => !seedPapers.some((s) => s.id === p.id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
}

export function LiteratureWorkbench() {
  const [papers, setPapers] = useState<PaperNode[]>(seedPapers);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const custom = JSON.parse(raw) as PaperNode[];
      setPapers([...seedPapers, ...custom]);
    } catch {
      /* seed only */
    }
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(papers[0]?.id ?? null);
  const [raw, setRaw] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = papers.find((p) => p.id === selectedId) ?? papers[0];

  const graphEdges = useMemo(() => {
    const edges: { from: string; to: string; kind: "rq" | "cite" }[] = [];
    for (const p of papers) {
      for (const rq of p.researchQuestionIds) {
        edges.push({ from: p.id, to: rq, kind: "rq" });
      }
      for (const c of p.cites ?? []) {
        edges.push({ from: p.id, to: c, kind: "cite" });
      }
    }
    return edges;
  }, [papers]);

  async function runParse() {
    setBusy(true);
    const res = await fetch("/api/literature/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: raw }),
    });
    setBusy(false);
    if (res.ok) setParseResult((await res.json()) as ParseResult);
  }

  function addPaperFromParse() {
    if (!parseResult) return;
    const id = `paper-${Date.now()}`;
    const node: PaperNode = {
      id,
      title: parseResult.title,
      authors: "Added via parser",
      keyPoints: parseResult.keyPoints,
      researchQuestionIds: parseResult.suggestedResearchQuestionIds,
      cites: parseResult.suggestedCitations.map((c) => c.id),
    };
    const next = [...papers, node];
    setPapers(next);
    saveCustom(next);
    setSelectedId(id);
    setParseResult(null);
    setRaw("");
  }

  function autoExpand() {
    if (!selected) return;
    const expanded = expandCitations([selected.id], papers);
    if (expanded.length === 0) return;
    const next = [...papers];
    for (const p of expanded) {
      if (!next.some((x) => x.id === p.id)) next.push(p);
    }
    setPapers(next);
    saveCustom(next);
  }

  const nodePositions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    papers.forEach((p, i) => {
      const angle = (i / papers.length) * Math.PI * 2;
      pos.set(p.id, { x: 180 + Math.cos(angle) * 120, y: 140 + Math.sin(angle) * 90 });
    });
    researchQuestions.forEach((rq, i) => {
      pos.set(rq.id, { x: 40 + i * 90, y: 260 });
    });
    return pos;
  }, [papers]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Structure graph
        </p>
        <svg viewBox="0 0 360 300" className="mt-3 h-auto w-full">
          {graphEdges.map((e) => {
            const a = nodePositions.get(e.from);
            const b = nodePositions.get(e.to);
            if (!a || !b) return null;
            return (
              <line
                key={`${e.from}-${e.to}-${e.kind}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={e.kind === "cite" ? "#fbbf24" : "#2dd4bf"}
                strokeOpacity={0.35}
                strokeWidth={1.5}
              />
            );
          })}
          {papers.map((p) => {
            const pt = nodePositions.get(p.id);
            if (!pt) return null;
            const active = p.id === selected?.id;
            return (
              <g
                key={p.id}
                className="cursor-pointer"
                onClick={() => setSelectedId(p.id)}
              >
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={active ? 10 : 8}
                  fill={active ? "#14b8a6" : "#0f766e"}
                />
                <text x={pt.x + 12} y={pt.y + 4} fill="#94a3b8" fontSize={9}>
                  {p.title.slice(0, 28)}
                  {p.title.length > 28 ? "…" : ""}
                </text>
              </g>
            );
          })}
          {researchQuestions.map((rq) => {
            const pt = nodePositions.get(rq.id);
            if (!pt) return null;
            return (
              <g key={rq.id}>
                <rect
                  x={pt.x - 36}
                  y={pt.y - 10}
                  width={72}
                  height={20}
                  rx={4}
                  fill="#1e293b"
                />
                <text x={pt.x} y={pt.y + 4} fill="#cbd5e1" fontSize={7} textAnchor="middle">
                  RQ
                </text>
              </g>
            );
          })}
        </svg>
        {selected ? (
          <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-4 text-sm">
            <p className="font-medium text-zinc-100">{selected.title}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-500">
              {selected.keyPoints.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={autoExpand}
              className="mt-4 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10"
            >
              Auto-expand citations
            </button>
          </div>
        ) : null}
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <p className="text-sm font-medium text-zinc-200">Parsing engine</p>
          <p className="mt-1 text-xs text-zinc-500">
            Paste title, abstract, or DOI landing text — key points and RQ tags are extracted
            server-side.
          </p>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={8}
            className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-teal-500/30"
            placeholder="Paste abstract or citation…"
          />
          <button
            type="button"
            disabled={busy || raw.length < 20}
            onClick={runParse}
            className="mt-3 rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-[#042f2e] disabled:opacity-50"
          >
            {busy ? "Parsing…" : "Parse & suggest"}
          </button>
          {parseResult ? (
            <div className="mt-4 space-y-2 text-xs text-zinc-400">
              <p className="font-medium text-zinc-200">{parseResult.title}</p>
              <ul className="list-disc pl-4">
                {parseResult.keyPoints.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={addPaperFromParse}
                className="mt-2 rounded-lg border border-teal-500/40 px-3 py-1.5 text-teal-200"
              >
                Add to graph
              </button>
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-dashed border-white/10 p-4 text-xs text-zinc-500">
          PDF upload → connect storage bucket or Drive webhook next. Graph persists custom papers
          in browser localStorage.
        </div>
      </div>
    </div>
  );
}
