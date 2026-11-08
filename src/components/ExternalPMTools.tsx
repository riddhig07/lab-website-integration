import { lab } from "@/content/site";

export function ExternalPMTools() {
  return (
    <section className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-5">
      <h2 className="font-display text-base font-semibold text-zinc-200">
        Notion & Trello (use directly)
      </h2>
      <p className="mt-2 text-sm text-zinc-500">
        The on-site board clones essential Trello columns. For grant templates and rich docs, open
        your external workspaces — or use GitHub + Cursor MCP for repo-aware tracking.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href={lab.links.notion}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border border-white/10 px-4 py-2 text-sm text-teal-300 hover:border-teal-500/30"
        >
          Open Notion →
        </a>
        <a
          href={lab.links.trello}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border border-white/10 px-4 py-2 text-sm text-teal-300 hover:border-teal-500/30"
        >
          Open Trello →
        </a>
        <a
          href="/intranet/git"
          className="rounded-xl border border-white/10 px-4 py-2 text-sm text-teal-300 hover:border-teal-500/30"
        >
          Git team hub →
        </a>
      </div>
    </section>
  );
}
