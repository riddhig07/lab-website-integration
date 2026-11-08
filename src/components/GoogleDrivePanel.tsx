import { lab } from "@/content/site";

export function GoogleDrivePanel() {
  const folderId = process.env.NEXT_PUBLIC_DRIVE_FOLDER_ID;

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <h2 className="font-display text-lg font-semibold text-zinc-100">
        Google Drive — brainstorming & docs
      </h2>
      <p className="mt-2 text-sm text-zinc-500">
        Brainstorming docs and individual idea files — full tree on{" "}
        <a href="/intranet/drive" className="text-teal-300 hover:underline">
          Drive
        </a>
        . Embed preview with <code className="text-teal-200">NEXT_PUBLIC_DRIVE_FOLDER_ID</code> or
        connect API keys; use Drive MCP in Cursor for write access from the agent.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href={lab.links.driveBrainstorm}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-teal-300"
        >
          Brainstorm folder →
        </a>
        <a
          href={lab.links.drive}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-teal-300"
        >
          Main Drive →
        </a>
      </div>
      {folderId ? (
        <iframe
          title="Lab Google Drive folder"
          src={`https://drive.google.com/embeddedfolderview?id=${folderId}#grid`}
          className="mt-4 h-96 w-full rounded-xl border border-white/10 bg-black/20"
        />
      ) : (
        <div className="mt-4 flex h-48 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-zinc-600">
          Folder embed appears when NEXT_PUBLIC_DRIVE_FOLDER_ID is set
        </div>
      )}
    </section>
  );
}
