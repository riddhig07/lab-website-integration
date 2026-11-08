import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import {
  customCalendarEvents,
  LAB_TIMEZONE,
  recurringMeetingRules,
  type CustomCalendarEvent,
  type RecurringMeetingRule,
} from "@/content/calendar";
import { meetingIdFrom } from "@/lib/meeting-hub/meeting-id";
import type { MeetingType } from "@/lib/meeting-hub/types";

export type CalendarEventInstance = {
  id: string;
  title: string;
  dateKey: string;
  meetingId?: string;
  startUtc: Date;
  endUtc: Date;
  source: "recurring" | "custom";
  ruleId?: string;
  color: "teal" | "amber" | "violet";
  description: string;
  type: "recurring-meeting" | CustomCalendarEvent["type"];
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Wall-clock in America/Los_Angeles → UTC instant (DST-safe). */
export function laWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): Date {
  return fromZonedTime(
    `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:00`,
    LAB_TIMEZONE,
  );
}

export function laDateKey(date: Date): string {
  return formatInTimeZone(date, LAB_TIMEZONE, "yyyy-MM-dd");
}

export function laWeekday(date: Date): number {
  return toZonedTime(date, LAB_TIMEZONE).getDay();
}

export function laNowParts(): { year: number; month: number; day: number } {
  const now = new Date();
  const y = Number(formatInTimeZone(now, LAB_TIMEZONE, "yyyy"));
  const m = Number(formatInTimeZone(now, LAB_TIMEZONE, "M"));
  const d = Number(formatInTimeZone(now, LAB_TIMEZONE, "d"));
  return { year: y, month: m, day: d };
}

function instanceFromRule(rule: RecurringMeetingRule, dateKey: string): CalendarEventInstance {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const startUtc = laWallTimeToUtc(y, mo, d, rule.startHour, rule.startMinute);
  const endUtc = laWallTimeToUtc(y, mo, d, rule.endHour, rule.endMinute);
  const meetingType: MeetingType = rule.weekday === 1 ? "monday" : "thursday";
  return {
    id: `${rule.id}-${dateKey}`,
    title: rule.title,
    dateKey,
    meetingId: meetingIdFrom(dateKey, meetingType),
    startUtc,
    endUtc,
    source: "recurring",
    ruleId: rule.id,
    color: rule.color,
    description: rule.description,
    type: "recurring-meeting",
  };
}

function instanceFromCustom(ev: CustomCalendarEvent): CalendarEventInstance {
  const [y, mo, d] = ev.date.split("-").map(Number);
  return {
    id: ev.id,
    title: ev.title,
    dateKey: ev.date,
    startUtc: laWallTimeToUtc(y, mo, d, ev.startHour, ev.startMinute),
    endUtc: laWallTimeToUtc(y, mo, d, ev.endHour, ev.endMinute),
    source: "custom",
    color: "violet",
    description: ev.description ?? "",
    type: ev.type,
  };
}

export function eventsForDateKey(
  dateKey: string,
  weekday: number,
  extraCustom: CustomCalendarEvent[] = [],
): CalendarEventInstance[] {
  const out: CalendarEventInstance[] = [];
  for (const rule of recurringMeetingRules) {
    if (rule.weekday === weekday) {
      out.push(instanceFromRule(rule, dateKey));
    }
  }
  for (const ev of [...customCalendarEvents, ...extraCustom]) {
    if (ev.date === dateKey) out.push(instanceFromCustom(ev));
  }
  return out.sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());
}

export function monthGridDays(viewYear: number, viewMonth: number): Date[] {
  const firstOfMonth = laWallTimeToUtc(viewYear, viewMonth, 1);
  const gridStart = addDays(firstOfMonth, -laWeekday(firstOfMonth));
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function isDateInViewMonth(date: Date, viewYear: number, viewMonth: number): boolean {
  const y = Number(formatInTimeZone(date, LAB_TIMEZONE, "yyyy"));
  const m = Number(formatInTimeZone(date, LAB_TIMEZONE, "M"));
  return y === viewYear && m === viewMonth;
}

export function formatEventTimeRange(ev: CalendarEventInstance): string {
  const start = formatInTimeZone(ev.startUtc, LAB_TIMEZONE, "h:mm a");
  const end = formatInTimeZone(ev.endUtc, LAB_TIMEZONE, "h:mm a");
  return `${start} – ${end}`;
}

export function upcomingEvents(
  count: number,
  extraCustom: CustomCalendarEvent[] = [],
): CalendarEventInstance[] {
  const now = new Date();
  const all: CalendarEventInstance[] = [];
  for (let offset = 0; offset < 90; offset++) {
    const day = addDays(now, offset);
    const key = laDateKey(day);
    const wd = laWeekday(day);
    all.push(...eventsForDateKey(key, wd, extraCustom));
  }
  return all
    .filter((e) => e.endUtc.getTime() >= now.getTime())
    .sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime())
    .slice(0, count);
}
