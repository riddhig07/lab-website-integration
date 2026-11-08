import { PublicShell } from "@/components/PublicShell";
import { LabCalendar } from "@/components/calendar/LabCalendar";

export const metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <PublicShell>
      <main className="mx-auto max-w-6xl px-6 py-12 sm:px-8 sm:py-16">
        <h1 className="font-display text-4xl font-bold text-white">Lab calendar</h1>
        <p className="mt-4 max-w-2xl text-zinc-400">
          Weekly meetings in Pacific Time. Click a date or event for details. Custom deadlines and
          talks can be added in{" "}
          <code className="rounded bg-white/5 px-1 text-sm text-teal-200">
            src/content/calendar.ts
          </code>
          .
        </p>
        <div className="mt-10">
          <LabCalendar />
        </div>
      </main>
    </PublicShell>
  );
}
