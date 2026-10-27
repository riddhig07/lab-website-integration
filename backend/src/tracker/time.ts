// Wall-clock time in the tracker's timezone (TRACKER_TIMEZONE), without a
// date library: Intl gives the local fields of an instant, and zonedToUtc
// inverts that by correcting for the zone's offset.
import { config } from '../config';

export const TZ = config.tracker.timezone;

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formats = new Map<string, Intl.DateTimeFormat>();

function partsFormat(timeZone: string): Intl.DateTimeFormat {
  let format = formats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    });
    formats.set(timeZone, format);
  }
  return format;
}

export function zonedParts(date: Date, timeZone = TZ): ZonedParts {
  const format = partsFormat(timeZone);
  const p: Record<string, string> = {};
  for (const { type, value } of format.formatToParts(date)) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

/** Minutes the zone is ahead of UTC at this instant. */
function offsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000);
}

/** The instant when the zone's clock reads this date and time. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute = 0, timeZone = TZ): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let result = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  // Near a DST change the offset at the guess and at the answer can differ.
  const second = guess - offsetMinutes(new Date(result), timeZone) * 60_000;
  if (second !== result) result = second;
  return new Date(result);
}

/** A calendar date `days` after y-m-d (days may be negative). */
export function addDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export const isoDate = (d: { year: number; month: number; day: number }) =>
  `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

/** The local calendar date of an instant, as YYYY-MM-DD. */
export function localDate(date: Date): string {
  return isoDate(zonedParts(date));
}

const shortDate = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: '2-digit' });

export function formatShortDate(date: Date): string {
  return shortDate.format(date);
}
