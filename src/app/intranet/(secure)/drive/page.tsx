import { DriveExplorer } from "@/components/DriveExplorer";

export const metadata = { title: "Google Drive" };

export default function IntranetDrivePage() {
  return (
    <>
      <h1 className="font-display text-3xl font-bold text-white">Google Drive</h1>
      <p className="mt-3 max-w-2xl text-zinc-400">
        Central view of Nath Lab Drive: every subfolder (platform research, meeting notes,
        literature, website planning) and documents inside. Brainstorming Google Docs live here —
        use Cursor <strong className="font-normal text-zinc-300">Drive MCP</strong> for agent-side
        edits while this UI is read-only browse.
      </p>
      <div className="mt-10">
        <DriveExplorer />
      </div>
    </>
  );
}
