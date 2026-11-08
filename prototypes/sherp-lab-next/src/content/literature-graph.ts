export type ResearchQuestion = {
  id: string;
  label: string;
};

export type PaperNode = {
  id: string;
  title: string;
  authors: string;
  year?: number;
  doi?: string;
  keyPoints: string[];
  researchQuestionIds: string[];
  cites?: string[];
};

export const researchQuestions: ResearchQuestion[] = [
  { id: "rq-objectnav", label: "Sim-to-real gaps in zero-shot ObjectNav" },
  { id: "rq-platforms", label: "UGV platforms under lab budget & modular tops" },
  { id: "rq-benchmarks", label: "Physical benchmark standardization & runtime checks" },
  { id: "rq-controls", label: "Spline / pure pursuit baselines on URV Waveshare" },
];

export const seedPapers: PaperNode[] = [
  {
    id: "paper-objectnav-draft",
    title: "Zero-shot ObjectNav survey (cohort draft)",
    authors: "SHERP AI literature cohort",
    year: 2026,
    keyPoints: [
      "Open-vocabulary goals stress simulators without matched real clutter.",
      "Modular sensor tops change failure modes vs fixed benchmarks.",
    ],
    researchQuestionIds: ["rq-objectnav", "rq-platforms"],
    cites: ["paper-platform-tradeoffs"],
  },
  {
    id: "paper-platform-tradeoffs",
    title: "Mobile robot platform tradeoffs",
    authors: "Platform research group",
    year: 2026,
    keyPoints: [
      "JetRacer prioritizes speed; HiWonder enables holonomic motion.",
      "Yahboom Ackermann pairs with Orin Nano for onboard VLM inference.",
    ],
    researchQuestionIds: ["rq-platforms"],
    cites: ["paper-benchmark-notes"],
  },
  {
    id: "paper-benchmark-notes",
    title: "Physical benchmark design notes",
    authors: "Benchmark team",
    year: 2026,
    keyPoints: [
      "LLM-filled runtime sheets reduce missed steps during eval.",
      "Object sets should version with layout photos for reproducibility.",
    ],
    researchQuestionIds: ["rq-benchmarks"],
  },
];
