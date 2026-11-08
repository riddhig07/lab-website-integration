import { PublicShell } from "@/components/PublicShell";
import { AINoteTaker } from "@/components/meeting-hub/AINoteTaker";
import { HubSubNav } from "@/components/meeting-hub/HubSubNav";

export const metadata = { title: "AI Note Taker" };

export default function AINoteTakerPage() {
  return (
    <PublicShell>
      <main className="mx-auto max-w-6xl px-6 py-12 sm:px-8 sm:py-16">
        <h1 className="font-display text-4xl font-bold text-white">AI note taker</h1>
        <p className="mt-4 max-w-2xl text-zinc-400">
          Record or upload audio, transcribe, and generate structured draft summaries for researcher
          review before publishing.
        </p>
        <div className="mt-8">
          <HubSubNav active="/ai-note-taker" />
          <AINoteTaker />
        </div>
      </main>
    </PublicShell>
  );
}
