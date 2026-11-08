import { PublicShell } from "@/components/PublicShell";
import { HubSubNav } from "@/components/meeting-hub/HubSubNav";
import { MeetingDetailClient } from "@/components/meeting-hub/MeetingDetailClient";

export const metadata = { title: "Meeting" };

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  return (
    <PublicShell>
      <main className="mx-auto max-w-4xl px-6 py-12 sm:px-8 sm:py-16">
        <HubSubNav active="/meetings" />
        <MeetingDetailClient meetingId={meetingId} />
      </main>
    </PublicShell>
  );
}
