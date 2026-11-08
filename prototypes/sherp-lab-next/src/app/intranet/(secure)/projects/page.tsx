import { ExternalPMTools } from "@/components/ExternalPMTools";
import { GitHubActivityPanel } from "@/components/GitHubActivityPanel";
import { ProjectBoard } from "@/components/ProjectBoard";

export const metadata = { title: "Projects" };

export default function IntranetProjectsPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-bold text-white">Task tracking & project management</h1>
      <p className="mt-3 max-w-2xl text-zinc-400">
        Track experiments, grant writing deadlines, publication pipelines, and individual assignments.
        Clone essential Trello/Notion flows here or open external boards; GitHub MCP + team hub for
        push tracking.
      </p>
      <div className="mt-8">
        <ExternalPMTools />
      </div>
      <div className="mt-10">
        <ProjectBoard />
      </div>
      <div className="mt-10">
        <GitHubActivityPanel />
      </div>
    </>
  );
}
