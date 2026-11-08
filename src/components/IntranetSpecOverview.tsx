import Link from "next/link";

const sections = [
  {
    title: "I. Public site",
    items: [
      { label: "Home / overview", href: "/" },
      { label: "People", href: "/people" },
      { label: "Research", href: "/research" },
      { label: "Publications", href: "/publications" },
      { label: "Timeline / news", href: "/news" },
      { label: "Calendar", href: "/calendar" },
      { label: "Contact & join", href: "/contact" },
    ],
  },
  {
    title: "II. Intranet",
    items: [
      { label: "Docs & knowledge base", href: "/intranet/docs" },
      { label: "Google Drive + brainstorm", href: "/intranet/drive" },
      { label: "Literature graph + parser", href: "/intranet/literature" },
      { label: "Task / PM boards", href: "/intranet/projects" },
      { label: "GitHub team hub", href: "/intranet/git" },
      { label: "Lab operations", href: "/intranet/ops" },
      { label: "Meetings + transcription", href: "/intranet/meetings" },
    ],
  },
  {
    title: "III. Interactive demos",
    items: [
      { label: "URV spline hero", href: "/#demos" },
      { label: "Three.js bot viewer", href: "/#demos" },
      { label: "Simulator videos", href: "/research" },
      { label: "uPlot telemetry", href: "/research" },
    ],
  },
] as const;

export function IntranetSpecOverview() {
  return (
    <section className="mt-12 rounded-2xl border border-teal-500/15 bg-teal-500/5 p-6">
      <h2 className="font-display text-lg font-semibold text-teal-100">Lab site structure map</h2>
      <p className="mt-2 text-sm text-zinc-500">
        Matches the Nath Lab website planning doc — every item links to its live page.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {sections.map((block) => (
          <div key={block.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {block.title}
            </h3>
            <ul className="mt-3 space-y-2">
              {block.items.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="text-sm text-zinc-400 transition hover:text-teal-300"
                  >
                    {item.label} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
