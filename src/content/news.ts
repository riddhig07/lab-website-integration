export type NewsKind =
  | "milestone"
  | "conference"
  | "award"
  | "event"
  | "upcoming";

export type NewsItem = {
  date: string;
  title: string;
  body: string;
  kind: NewsKind;
  location?: string;
};

export const newsItems: NewsItem[] = [
  {
    date: "2026-11-15",
    title: "Robotics seminar — ObjectNav benchmarks (upcoming)",
    body: "Cohort presents physical benchmark proposal and URV demo clip.",
    kind: "upcoming",
    location: "TBD campus room",
  },
  {
    date: "2026-10-12",
    title: "Physical benchmark brainstorming",
    body: "Team aligned on environment ideas, expansion notes, and runtime checklist templates.",
    kind: "milestone",
  },
  {
    date: "2026-10-08",
    title: "Literature review sprint",
    body: "Cohort drafts on navigation, simulators, and platform tradeoffs entered review.",
    kind: "milestone",
  },
  {
    date: "2026-10-05",
    title: "Guest talk — sim-to-real for mobile manipulation",
    body: "Notes archived on intranet; action items added to publication pipeline board.",
    kind: "conference",
    location: "Virtual",
  },
  {
    date: "2026-10-01",
    title: "Fall kickoff",
    body: "Agenda set for platform research, website planning, and weekly sync cadence.",
    kind: "event",
  },
  {
    date: "2026-09-28",
    title: "RC platform survey milestone",
    body: "Initial doc on JetRacer, HiWonder, and Yahboom configurations with modular tops.",
    kind: "milestone",
  },
];

export const newsKindLabels: Record<NewsKind, string> = {
  milestone: "Milestone",
  conference: "Conference / talk",
  award: "Award",
  event: "Lab event",
  upcoming: "Upcoming",
};
