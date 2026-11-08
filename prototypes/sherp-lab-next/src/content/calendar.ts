/** Lab calendar timezone — handles PST/PDT automatically. */
export const LAB_TIMEZONE = "America/Los_Angeles";

export type RecurringMeetingRule = {
  id: string;
  title: string;
  /** 0 = Sunday … 6 = Saturday (same as JS getDay in zoned local date) */
  weekday: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  color: "teal" | "amber";
  description: string;
};

/** Weekly recurring rules — not individual hardcoded dates. */
export const recurringMeetingRules: RecurringMeetingRule[] = [
  {
    id: "mon-lab-meeting",
    title: "Monday Lab Meeting",
    weekday: 1,
    startHour: 12,
    startMinute: 30,
    endHour: 13,
    endMinute: 30,
    color: "teal",
    description: "Weekly lab sync — agenda and notes on the intranet.",
  },
  {
    id: "thu-lab-meeting",
    title: "Thursday Lab Meeting",
    weekday: 4,
    startHour: 15,
    startMinute: 30,
    endHour: 17,
    endMinute: 30,
    color: "amber",
    description: "Extended weekly meeting — experiments, writing, and pipeline review.",
  },
];

/** One-off / future custom events (deadlines, talks, milestones). */
export type CustomCalendarEvent = {
  id: string;
  title: string;
  /** YYYY-MM-DD in America/Los_Angeles */
  date: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  type: "deadline" | "presentation" | "milestone" | "other";
  description?: string;
};

export const customCalendarEvents: CustomCalendarEvent[] = [];

export const eventTypeLegend = [
  { label: "Monday lab meeting", color: "teal" as const },
  { label: "Thursday lab meeting", color: "amber" as const },
  { label: "Custom events", color: "violet" as const },
];
