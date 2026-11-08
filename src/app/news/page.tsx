import { PublicShell } from "@/components/PublicShell";
import { NewsTimeline } from "@/components/NewsTimeline";

export const metadata = { title: "News" };

export default function NewsPage() {
  return (
    <PublicShell>
      <main className="mx-auto max-w-3xl px-6 py-12 sm:px-8 sm:py-16">
        <h1 className="font-display text-4xl font-bold text-white">Timeline & news</h1>
        <p className="mt-4 text-zinc-400">
          Chronological feed of lab milestones, conference presentations, awards, and upcoming
          events.
        </p>
        <div className="mt-12">
          <NewsTimeline />
        </div>
      </main>
    </PublicShell>
  );
}
