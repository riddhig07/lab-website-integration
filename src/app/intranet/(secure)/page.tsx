import { IntranetCard } from "@/components/IntranetCard";
import { IntranetSpecOverview } from "@/components/IntranetSpecOverview";
import { GoogleDrivePanel } from "@/components/GoogleDrivePanel";
import { GitHubActivityPanel } from "@/components/GitHubActivityPanel";
import { lab } from "@/content/site";

export const metadata = { title: "Intranet" };

export default function IntranetDashboardPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-bold text-white">Dashboard</h1>
      <p className="mt-3 max-w-2xl text-zinc-400">
        Internal hub: knowledge base, Drive brainstorming, literature graph, PM boards, GitHub,
        lab ops, and meetings.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <IntranetCard
          title="Google Drive"
          description="Full folder tree — Fall 2026 platform research, meeting notes, literature."
          href="/intranet/drive"
        />
        <IntranetCard
          title="Document storage"
          description="SOPs, onboarding, safety protocols, and shared reference PDFs."
          href="/intranet/docs"
        />
        <IntranetCard
          title="Git team hub"
          description="Track repos, pushes, stale work, and branches behind main."
          href="/intranet/git"
        />
        <IntranetCard
          title="Literature graph"
          description="Papers → key points → research questions with parser + citation expand."
          href="/intranet/literature"
        />
        <IntranetCard
          title="Project boards"
          description="Drag-and-drop tasks; Notion/Trello links; GitHub events."
          href="/intranet/projects"
        />
        <IntranetCard
          title="GitHub"
          description="Org/repo activity feed for sim and embedded stacks."
          href="/intranet/projects"
        />
        <IntranetCard
          title="Lab ops"
          description="Equipment reservations, inventory, maintenance logs."
          href="/intranet/ops"
        />
        <IntranetCard
          title="Meetings"
          description="Agendas, decision logs, transcription archive."
          href="/intranet/meetings"
        />
        <IntranetCard
          title="Notion workspace"
          description="Optional external PM — open when ready."
          href={lab.links.notion}
          external
        />
        <IntranetCard
          title="Trello board"
          description="Optional external board — open when ready."
          href={lab.links.trello}
          external
        />
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <GoogleDrivePanel />
        <GitHubActivityPanel />
      </div>

      <IntranetSpecOverview />
    </>
  );
}
