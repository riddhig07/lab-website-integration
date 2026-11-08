export type LabDocument = {
  id: string;
  title: string;
  category: "sop" | "onboarding" | "safety" | "benchmark" | "reference";
  summary: string;
  body: string;
  driveUrl?: string;
};

export const labDocuments: LabDocument[] = [
  {
    id: "onboarding",
    title: "Onboarding checklist",
    category: "onboarding",
    summary: "Accounts, safety training, hardware access, GitHub org invite.",
    body: `## Onboarding checklist

1. Complete university lab safety training and sign the Nath Lab acknowledgment.
2. Request GitHub org access and clone the sim + embedded monorepos.
3. Read platform comparison matrix (JetRacer / HiWonder / Yahboom).
4. Schedule UGV checkout with a postdoc and log your first reservation in Lab ops.
5. Add yourself to the literature graph with one seed paper from your review.`,
  },
  {
    id: "benchmark-runtime",
    title: "Benchmarking base (LLM runtime template)",
    category: "benchmark",
    summary: "Fields filled by LLMs during physical eval runs.",
    body: `## Runtime checklist

- Environment ID and layout photo hash
- Object set version
- Policy / model revision
- Weather & lighting notes
- Failure taxonomy tags
- Post-run operator sign-off`,
    driveUrl: "https://drive.google.com",
  },
  {
    id: "platform-matrix",
    title: "Platform comparison matrix",
    category: "reference",
    summary: "Drivetrain, compute, sensor tops, and budget notes.",
    body: `## Platforms

| Platform | Drivetrain | Compute | Notes |
|----------|------------|---------|-------|
| JetRacer | Speed-optimized | Jetson class | Great for pure pursuit demos |
| HiWonder | Mecanum omni | Varies | Holonomic bench layouts |
| Yahboom | Ackermann | Orin Nano | Strong VLM onboard path |`,
  },
  {
    id: "lit-guidelines",
    title: "Literature review guidelines",
    category: "reference",
    summary: "Citation format, research questions, review cadence.",
    body: `## Guidelines

- Tag each paper to at least one research question in the intranet graph.
- Extract 2–5 bullet key points (claims, not abstracts).
- Link citations the lab cares about; use auto-suggest to expand the graph.`,
  },
  {
    id: "safety-ugv",
    title: "UGV safety SOP",
    category: "safety",
    summary: "Bench speed limits, e-stop, and checkout rules.",
    body: `## UGV safety

- Max 0.5 m/s in shared lab lanes unless PI approval posted.
- E-stop within arm's reach; never run unattended on spline demos.
- Log maintenance after every collision or motor fault.`,
  },
];
