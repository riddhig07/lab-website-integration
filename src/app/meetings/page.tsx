import { PublicShell } from "@/components/PublicShell";
import { HubSubNav } from "@/components/meeting-hub/HubSubNav";
import { MeetingsDashboard } from "@/components/meeting-hub/MeetingsDashboard";

export const metadata = { title: "Meetings" };

export default function MeetingsPage() {
  return (
    <PublicShell>
      <main className="mx-auto max-w-6xl px-6 py-12 sm:px-8 sm:py-16">
        <h1 className="font-display text-4xl font-bold text-white">Meeting history</h1>
        <p className="mt-4 max-w-2xl text-zinc-400">
          Lab meetings linked to Google Drive agendas and notes, AI summaries, and action items.
        </p>
        <div className="mt-8">
          <HubSubNav active="/meetings" />
          <MeetingsDashboard />
        </div>
      </main>
    </PublicShell>
  );
}
