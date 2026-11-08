export const lab = {
  name: "SHERP AI Lab",
  shortName: "SHERP AI",
  affiliation: "Nath Lab · Fall 2026",
  tagline: "Embodied AI for navigation, manipulation, and real-world benchmarks.",
  mission:
    "We build mobile robot platforms, sim-to-real stacks, and rigorous physical benchmarks for zero-shot object navigation and general-purpose lab autonomy.",
  email: "lab@sherp.ai",
  joinBlurb:
    "We welcome motivated undergraduates, MS/PhD students, and visiting researchers. Send a brief note with your background and what you want to work on.",
  themes: [
    {
      title: "Zero-shot ObjectNav",
      description:
        "Language-conditioned navigation on custom UGV platforms with modular sensor tops.",
    },
    {
      title: "Physical benchmarks",
      description:
        "Reproducible environments, SOPs, and metrics for comparing policies in the real world.",
    },
    {
      title: "Sim ↔ real stacks",
      description:
        "Sensor fusion, pure-pursuit baselines, and tooling to close the loop from simulation to hardware.",
    },
  ],
  highlights: [
    "Platform survey: JetRacer, HiWonder Mecanum, Yahboom Ackermann + Orin Nano kits",
    "Fall 2026 literature review cohort on embodied navigation and benchmark design",
    "URV Waveshare CAD platform — spline trajectories and object discovery demos",
  ],
  links: {
    github: process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com",
    drive: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_URL ?? "https://drive.google.com",
    driveBrainstorm:
      process.env.NEXT_PUBLIC_DRIVE_BRAINSTORM_URL ??
      "https://drive.google.com/drive/folders/placeholder-brainstorm",
    notion: process.env.NEXT_PUBLIC_NOTION_URL ?? "https://www.notion.so",
    trello: process.env.NEXT_PUBLIC_TRELLO_URL ?? "https://trello.com",
  },
  designResources: [
    { label: "react-bits", href: "https://github.com/DavidHDev/react-bits" },
    { label: "impeccable", href: "https://github.com/pbakaus/impeccable" },
    { label: "taste-skill", href: "https://github.com/leonxlnx/taste-skill" },
    {
      label: "awesome-design-skills",
      href: "https://github.com/bergside/awesome-design-skills",
    },
  ],
} as const;

export const navLinks = [
  { href: "/", label: "Home" },
  { href: "/people", label: "People" },
  { href: "/research", label: "Research" },
  { href: "/publications", label: "Publications" },
  { href: "/news", label: "News" },
  { href: "/calendar", label: "Calendar" },
  { href: "/meetings", label: "Meetings" },
  { href: "/lab-drive", label: "Lab Drive" },
  { href: "/ai-note-taker", label: "AI Note Taker" },
  { href: "/contact", label: "Contact" },
] as const;
