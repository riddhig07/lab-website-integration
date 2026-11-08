export type Project = {
  title: string;
  summary: string;
  status: "active" | "planning";
  tags: string[];
};

export type PublicationCategory =
  | "preprint"
  | "journal"
  | "conference"
  | "technical-report"
  | "workshop";

export type Publication = {
  title: string;
  authors: string;
  venue: string;
  year: number;
  category: PublicationCategory;
  href?: string;
};

export const publicationCategoryLabels: Record<PublicationCategory, string> = {
  preprint: "Preprints",
  journal: "Journal",
  conference: "Conference",
  "technical-report": "Technical reports",
  workshop: "Workshop",
};

export const projects: Project[] = [
  {
    title: "Mobile platforms for zero-shot ObjectNav",
    summary:
      "Comparative study of RC/UGV kits (speed, odometry, compute) with modular claws, cameras, and sensor payloads.",
    status: "active",
    tags: ["hardware", "ObjectNav"],
  },
  {
    title: "Physical benchmark environments",
    summary:
      "Standardized layouts, object sets, and LLM-assisted runtime checklists for repeatable real-world evaluation.",
    status: "active",
    tags: ["benchmarks", "SOPs"],
  },
  {
    title: "URV Waveshare trajectory demos",
    summary:
      "Spline paths, pure pursuit, and object discovery sequences for outreach and regression testing.",
    status: "planning",
    tags: ["controls", "demo"],
  },
];

export const publications: Publication[] = [
  {
    title: "Literature review compendium (internal draft)",
    authors: "SHERP AI cohort",
    venue: "Lab report",
    year: 2026,
    category: "technical-report",
  },
  {
    title: "Platform tradeoffs for zero-shot ObjectNav (survey)",
    authors: "Platform research group",
    venue: "In preparation",
    year: 2026,
    category: "preprint",
  },
];

export const software = [
  {
    name: "Lab site & intranet",
    description: "Public site, Drive browser, literature graph, Git team hub.",
    href: "#",
  },
  {
    name: "Simulator stack",
    description: "Scene randomization and policy export — videos on Research page.",
    href: "/research",
  },
];

export const datasets = [
  {
    name: "Benchmark layout photos v1",
    description: "Versioned photos and object-set manifests for physical eval reproducibility.",
    href: "#",
  },
  {
    name: "Trajectory logs (sample)",
    description: "Anonymized pure-pursuit / spline runs for chart demos.",
    href: "#",
  },
];
