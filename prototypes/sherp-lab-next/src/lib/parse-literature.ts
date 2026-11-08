import {
  researchQuestions,
  seedPapers,
  type PaperNode,
} from "@/content/literature-graph";

export type ParseResult = {
  title: string;
  keyPoints: string[];
  suggestedResearchQuestionIds: string[];
  suggestedCitations: { id: string; title: string }[];
};

const RQ_KEYWORDS: Record<string, string[]> = {
  "rq-objectnav": ["objectnav", "navigation", "language", "zero-shot", "embodied"],
  "rq-platforms": ["platform", "ugv", "jetracer", "mecanum", "hardware", "robot car"],
  "rq-benchmarks": ["benchmark", "eval", "metric", "sop", "layout", "reproduc"],
  "rq-controls": ["pure pursuit", "spline", "control", "trajectory", "waveshare"],
};

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 24);
}

export function parseLiteratureText(raw: string): ParseResult {
  const lines = raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const title =
    lines.find((l) => l.length > 8 && !l.startsWith("http"))?.slice(0, 200) ??
    "Untitled paper";

  const blob = raw.toLowerCase();
  const suggestedResearchQuestionIds = researchQuestions
    .filter((rq) => RQ_KEYWORDS[rq.id]?.some((kw) => blob.includes(kw)))
    .map((rq) => rq.id);

  const keyPoints = sentences(raw).slice(0, 5);
  if (keyPoints.length === 0 && raw.length > 40) {
    keyPoints.push(raw.slice(0, 240));
  }

  const suggestedCitations = seedPapers
    .filter((p) =>
      p.researchQuestionIds.some((id) => suggestedResearchQuestionIds.includes(id)),
    )
    .slice(0, 4)
    .map((p) => ({ id: p.id, title: p.title }));

  return {
    title,
    keyPoints,
    suggestedResearchQuestionIds:
      suggestedResearchQuestionIds.length > 0
        ? suggestedResearchQuestionIds
        : ["rq-objectnav"],
    suggestedCitations,
  };
}

export function expandCitations(paperIds: string[], all: PaperNode[]): PaperNode[] {
  const seen = new Set<string>();
  const out: PaperNode[] = [];
  for (const id of paperIds) {
    const paper = all.find((p) => p.id === id);
    if (!paper) continue;
    for (const citeId of paper.cites ?? []) {
      if (seen.has(citeId)) continue;
      seen.add(citeId);
      const cited = all.find((p) => p.id === citeId);
      if (cited) out.push(cited);
    }
  }
  return out;
}
