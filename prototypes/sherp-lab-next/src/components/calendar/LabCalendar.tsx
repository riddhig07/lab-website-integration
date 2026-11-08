"use client";

import { addMonths, subMonths } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import { useMemo, useState } from "react";
import { eventTypeLegend, LAB_TIMEZONE } from "@/content/calendar";
import {
  eventsForDateKey,
  formatEventTimeRange,
  isDateInViewMonth,
  laDateKey,
  laNowParts,
  laWeekday,
  monthGridDays,
  upcomingEvents,
  type CalendarEventInstance,
} from "@/lib/lab-calendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function colorClasses(color: CalendarEventInstance["color"]) {
  if (color === "teal") return "bg-teal-500/25 border-teal-400/35 text-teal-100";
  if (color === "amber") return "bg-amber-500/20 border-amber-400/35 text-amber-100";
  return "bg-violet-500/20 border-violet-400/35 text-violet-100";
}

function EventModal({
  event,
  onClose,
}: {
  event: CalendarEventInstance;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a101a] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {formatInTimeZone(event.startUtc, LAB_TIMEZONE, "EEEE, MMMM d, yyyy")}
        </p>
        <h3 className="font-display mt-2 text-xl font-semibold text-white">{event.title}</h3>
        <p className="mt-2 text-sm text-teal-300">{formatEventTimeRange(event)} PT</p>
        {event.description ? (
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">{event.description}</p>
        ) : null}
        {event.meetingId ? (
          <Link
            href={`/meetings/${event.meetingId}`}
            className="mt-6 block w-full rounded-xl bg-teal-500 py-2.5 text-center text-sm font-semibold text-[#042f2e]"
          >
            Open meeting hub →
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl border border-white/10 py-2.5 text-sm text-zinc-300"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function LabCalendar() {
  const today = laNowParts();
  const [viewYear, setViewYear] = useState(today.year);
  const [viewMonth, setViewMonth] = useState(today.month);
  const [selectedKey, setSelectedKey] = useState(laDateKey(new Date()));
  const [activeEvent, setActiveEvent] = useState<CalendarEventInstance | null>(null);

  const gridDays = useMemo(() => monthGridDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const monthLabel = formatInTimeZone(
    new Date(viewYear, viewMonth - 1, 15),
    LAB_TIMEZONE,
    "MMMM yyyy",
  );

  const selectedEvents = useMemo(() => {
    const d = gridDays.find((day) => laDateKey(day) === selectedKey) ?? new Date();
    return eventsForDateKey(selectedKey, laWeekday(d));
  }, [selectedKey, gridDays]);

  const upcoming = useMemo(() => upcomingEvents(6), []);

  function goToday() {
    setViewYear(today.year);
    setViewMonth(today.month);
    setSelectedKey(laDateKey(new Date()));
  }

  function shiftMonth(delta: number) {
    const anchor = new Date(viewYear, viewMonth - 1, 1);
    const next = delta > 0 ? addMonths(anchor, 1) : subMonths(anchor, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth() + 1);
  }

  const todayKey = laDateKey(new Date());

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-white">{monthLabel}</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-sm text-teal-200"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5"
            >
              Next
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-500">
          {eventTypeLegend.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <span
                className={`h-2.5 w-2.5 rounded-sm ${
                  item.color === "teal"
                    ? "bg-teal-400"
                    : item.color === "amber"
                      ? "bg-amber-400"
                      : "bg-violet-400"
                }`}
              />
              {item.label}
            </span>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-white/8 bg-white/5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-xs">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-[#070b12] px-1 py-2">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px rounded-xl border border-t-0 border-white/8 bg-white/5">
          {gridDays.map((day) => {
            const key = laDateKey(day);
            const inMonth = isDateInViewMonth(day, viewYear, viewMonth);
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            const dayNum = formatInTimeZone(day, LAB_TIMEZONE, "d");
            const events = eventsForDateKey(key, laWeekday(day));

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                className={`min-h-[72px] border-b border-r border-white/5 bg-[#070b12] p-1 text-left transition sm:min-h-[88px] sm:p-2 ${
                  !inMonth ? "opacity-40" : ""
                } ${isSelected ? "ring-1 ring-inset ring-teal-400/50" : "hover:bg-white/[0.03]"}`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs sm:h-7 sm:w-7 ${
                    isToday ? "bg-teal-500 font-bold text-[#042f2e]" : "text-zinc-400"
                  }`}
                >
                  {dayNum}
                </span>
                <div className="mt-1 space-y-0.5">
                  {events.slice(0, 2).map((ev) => (
                    <span
                      key={ev.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveEvent(ev);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          setActiveEvent(ev);
                        }
                      }}
                      className={`block truncate rounded border px-1 py-0.5 text-[9px] sm:text-[10px] ${colorClasses(ev.color)}`}
                    >
                      {ev.title}
                    </span>
                  ))}
                  {events.length > 2 ? (
                    <span className="text-[9px] text-zinc-600">+{events.length - 2} more</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {formatInTimeZone(
              gridDays.find((d) => laDateKey(d) === selectedKey) ?? new Date(),
              LAB_TIMEZONE,
              "EEEE, MMM d",
            )}
          </h3>
          <ul className="mt-3 space-y-2">
            {selectedEvents.length === 0 ? (
              <li className="text-sm text-zinc-600">No events scheduled.</li>
            ) : (
              selectedEvents.map((ev) => (
                <li key={ev.id}>
                  <button
                    type="button"
                    onClick={() => setActiveEvent(ev)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition hover:opacity-90 ${colorClasses(ev.color)}`}
                  >
                    <span className="font-medium">{ev.title}</span>
                    <span className="mt-0.5 block text-xs opacity-80">
                      {formatEventTimeRange(ev)} PT
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <h3 className="font-display text-sm font-semibold text-white">Upcoming meetings</h3>
          <ul className="mt-3 space-y-3">
            {upcoming.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => setActiveEvent(ev)}
                  className="w-full text-left text-sm text-zinc-400 hover:text-teal-200"
                >
                  <time className="text-xs text-zinc-500">
                    {formatInTimeZone(ev.startUtc, LAB_TIMEZONE, "EEE, MMM d")}
                  </time>
                  <p className="font-medium text-zinc-200">{ev.title}</p>
                  <p className="text-xs">{formatEventTimeRange(ev)} PT</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      {activeEvent ? <EventModal event={activeEvent} onClose={() => setActiveEvent(null)} /> : null}
    </div>
  );
}
