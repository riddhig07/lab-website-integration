import Link from "next/link";
import { getApprovedSummaries } from "@/lib/meeting-hub/store";

export async function RecentLabUpdates() {
  const meetings = await getApprovedSummaries(3);

  if (meetings.length === 0) {
    return (
      <section className="mt-16 rounded-2xl border border-dashed border-white/10 p-6">
        <h2 className="font-display text-lg font-semibold text-zinc-300">Recent lab updates</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Approved meeting summaries appear here. Sign in to{" "}
          <Link href="/meetings" className="text-teal-300">
            Meetings
          </Link>{" "}
          to review AI drafts.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-16 rounded-2xl border border-white/8 bg-white/[0.02] p-6">
      <h2 className="font-display text-lg font-semibold text-white">Recent lab updates</h2>
      <p className="mt-1 text-xs text-zinc-600">From approved internal meeting summaries only.</p>
      <ul className="mt-4 space-y-4">
        {meetings.map((m) => (
          <li key={m.id}>
            <Link href={`/meetings/${m.id}`} className="group block">
              <time className="text-xs text-teal-400/80">{m.dateKey}</time>
              <p className="font-medium text-zinc-200 group-hover:text-teal-200">{m.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{m.summary?.overview}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
