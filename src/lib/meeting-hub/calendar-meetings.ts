import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { LAB_TIMEZONE, recurringMeetingRules } from "@/content/calendar";
import { laWallTimeToUtc, laWeekday } from "@/lib/lab-calendar";
import { meetingIdFrom } from "@/lib/meeting-hub/meeting-id";
import type { LabMeeting, MeetingType } from "@/lib/meeting-hub/types";

function ruleForType(type: MeetingType) {
  return type === "monday"
    ? recurringMeetingRules.find((r) => r.id === "mon-lab-meeting")
    : recurringMeetingRules.find((r) => r.id === "thu-lab-meeting");
}

export function buildMeetingForDate(dateKey: string, type: MeetingType): LabMeeting {
  const rule = ruleForType(type)!;
  const [y, mo, d] = dateKey.split("-").map(Number);
  const startIso = laWallTimeToUtc(y, mo, d, rule.startHour, rule.startMinute).toISOString();
  const endIso = laWallTimeToUtc(y, mo, d, rule.endHour, rule.endMinute).toISOString();
  const now = new Date().toISOString();
  return {
    id: meetingIdFrom(dateKey, type),
    dateKey,
    type,
    title: rule.title,
    startIso,
    endIso,
    linkedDriveFileIds: [],
    relatedProjects: [],
    updatedAt: now,
  };
}

export function generateMeetingInstances(daysBack = 120, daysForward = 90): LabMeeting[] {
  const out: LabMeeting[] = [];
  const start = addDays(new Date(), -daysBack);
  for (let i = 0; i <= daysBack + daysForward; i++) {
    const day = addDays(start, i);
    const dateKey = formatInTimeZone(day, LAB_TIMEZONE, "yyyy-MM-dd");
    const wd = laWeekday(day);
    if (wd === 1) out.push(buildMeetingForDate(dateKey, "monday"));
    if (wd === 4) out.push(buildMeetingForDate(dateKey, "thursday"));
  }
  return out;
}
