import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { DemoVideoGrid } from "@/components/DemoVideoGrid";
import { TelemetryChart } from "@/components/TelemetryChart";
import { datasets, projects, software } from "@/content/research";

export const metadata = { title: "Research" };

export default function ResearchPage() {

  return (
    <PublicShell>
      <main className="mx-auto max-w-6xl px-6 py-12 sm:px-8 sm:py-16">
        <h1 className="font-display text-4xl font-bold text-white">Research & work</h1>
        <p className="mt-4 max-w-2xl text-zinc-400">
          Active projects, open-source software, datasets, and demo media. Publications are listed on{" "}
          <Link href="/publications" className="text-teal-300 hover:underline">
            Publications
          </Link>
          .
        </p>

        <section className="mt-12">
          <h2 className="font-display text-xl font-semibold text-white">Active projects</h2>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {projects.map((project) => (
              <article
                key={project.title}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      project.status === "active"
                        ? "bg-teal-500/15 text-teal-200"
                        : "bg-zinc-500/15 text-zinc-400"
                    }`}
                  >
                    {project.status}
                  </span>
                  {project.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <h3 className="font-display mt-3 text-lg font-semibold text-zinc-100">
                  {project.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{project.summary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold text-white">Open-source software</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {software.map((item) => (
              <li
                key={item.name}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-5"
              >
                <h3 className="font-display font-semibold text-teal-200">{item.name}</h3>
                <p className="mt-2 text-sm text-zinc-500">{item.description}</p>
                {item.href.startsWith("/") ? (
                  <Link href={item.href} className="mt-3 inline-block text-sm text-teal-300">
                    View →
                  </Link>
                ) : item.href !== "#" ? (
                  <a href={item.href} className="mt-3 inline-block text-sm text-teal-300">
                    Repository →
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold text-white">Datasets</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {datasets.map((d) => (
              <li
                key={d.name}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-5"
              >
                <h3 className="font-display font-semibold text-zinc-100">{d.name}</h3>
                <p className="mt-2 text-sm text-zinc-500">{d.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="demos" className="mt-14 scroll-mt-24">
          <h2 className="font-display text-xl font-semibold text-white">Interactive demos</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Simulator stack videos, sensor recordings, and uPlot analysis charts.
          </p>
          <div className="mt-6 max-w-3xl">
            <TelemetryChart title="Benchmark telemetry (uPlot)" />
          </div>
          <div className="mt-8">
            <DemoVideoGrid />
          </div>
        </section>

        <p className="mt-10 text-sm text-zinc-500">
          Literature graph and meeting archives:{" "}
          <Link href="/intranet" className="text-teal-300 hover:underline">
            intranet
          </Link>
          .
        </p>
      </main>
    </PublicShell>
  );
}
