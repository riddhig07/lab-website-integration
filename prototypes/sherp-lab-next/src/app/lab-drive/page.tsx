import { PublicShell } from "@/components/PublicShell";
import { HubSubNav } from "@/components/meeting-hub/HubSubNav";
import { LabDriveHub } from "@/components/meeting-hub/LabDriveHub";

export const metadata = { title: "Lab Drive" };

export default function LabDrivePage() {
  return (
    <PublicShell>
      <main className="mx-auto max-w-6xl px-6 py-12 sm:px-8 sm:py-16">
        <h1 className="font-display text-4xl font-bold text-white">Lab Drive</h1>
        <p className="mt-4 max-w-2xl text-zinc-400">
          Browse Fall 2026 folders, search indexed content, and sync changes from Google Drive.
        </p>
        <div className="mt-8">
          <HubSubNav active="/lab-drive" />
          <LabDriveHub />
        </div>
      </main>
    </PublicShell>
  );
}
