"use client";

import { useState } from "react";
import { labDocuments, type LabDocument } from "@/content/docs";
import { lab } from "@/content/site";

function renderBody(body: string) {
  return body.split("\n").map((line, i) => {
    if (line.startsWith("## ")) {
      return (
        <h3 key={i} className="font-display mt-4 text-base font-semibold text-teal-200">
          {line.slice(3)}
        </h3>
      );
    }
    if (line.startsWith("|")) {
      return (
        <pre key={i} className="mt-2 overflow-x-auto text-xs text-zinc-400">
          {line}
        </pre>
      );
    }
    if (line.match(/^\d+\./)) {
      return (
        <p key={i} className="mt-1 text-sm text-zinc-400">
          {line}
        </p>
      );
    }
    if (!line.trim()) return <br key={i} />;
    return (
      <p key={i} className="mt-2 text-sm leading-relaxed text-zinc-400">
        {line}
      </p>
    );
  });
}

export function DocKnowledgeBase() {
  const [active, setActive] = useState<LabDocument>(labDocuments[0]);

  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <ul className="space-y-2">
        {labDocuments.map((doc) => (
          <li key={doc.id}>
            <button
              type="button"
              onClick={() => setActive(doc)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                doc.id === active.id
                  ? "border-teal-500/35 bg-teal-500/10"
                  : "border-white/8 bg-white/[0.02] hover:border-white/15"
              }`}
            >
              <p className="text-sm font-medium text-zinc-100">{doc.title}</p>
              <p className="mt-1 text-xs text-zinc-500">{doc.summary}</p>
            </button>
          </li>
        ))}
      </ul>
      <article className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {active.category}
        </p>
        <h2 className="font-display mt-2 text-2xl font-semibold text-white">{active.title}</h2>
        <div className="mt-4">{renderBody(active.body)}</div>
        {active.driveUrl ? (
          <a
            href={active.driveUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-block text-sm text-teal-300 hover:underline"
          >
            Open related Drive file →
          </a>
        ) : null}
        <a
          href={lab.links.drive}
          target="_blank"
          rel="noreferrer"
          className="mt-4 block text-sm text-zinc-500 hover:text-teal-300"
        >
          Full lab Drive →
        </a>
      </article>
    </div>
  );
}
