import type { MeetingType } from "@/lib/meeting-hub/types";

export function meetingIdFrom(dateKey: string, type: MeetingType): string {
  return `${dateKey}-${type === "monday" ? "mon" : "thu"}`;
}

export function parseMeetingId(id: string): { dateKey: string; type: MeetingType } | null {
  const m = id.match(/^(\d{4}-\d{2}-\d{2})-(mon|thu)$/);
  if (!m) return null;
  return { dateKey: m[1], type: m[2] === "mon" ? "monday" : "thursday" };
}
