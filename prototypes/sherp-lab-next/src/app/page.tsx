import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { DemoVideoGrid } from "@/components/DemoVideoGrid";
import { RobotHeroCanvas } from "@/components/RobotHeroCanvas";
import { RobotViewer3DLoader } from "@/components/RobotViewer3DLoader";
import { TelemetryChart } from "@/components/TelemetryChart";
import { lab } from "@/content/site";
import { newsItems } from "@/content/news";
import { RecentLabUpdates } from "@/components/meeting-hub/RecentLabUpdates";

export default function HomePage() {
  const latest = [...newsItems].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  return (
    <PublicShell>
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-12 sm:px-8 sm:pt-16">
        <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-teal-400/90">
              {lab.affiliation}
            </p>
            <h1 className="font-display mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              {lab.name}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
              {lab.mission}
            </p>
            <p className="mt-4 text-sm text-zinc-500">{lab.tagline}</p>
            <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-500">
              <Link href="/people" className="hover:text-teal-300">
                People
              </Link>
              <Link href="/research" className="hover:text-teal-300">
                Research
              </Link>
              <Link href="/publications" className="hover:text-teal-300">
                Publications
              </Link>
              <Link href="/news" className="hover:text-teal-300">
                News
              </Link>
              <Link href="/calendar" className="hover:text-teal-300">
                Calendar
              </Link>
              <Link href="/contact" className="hover:text-teal-300">
                Contact
              </Link>
            </nav>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/research"
                className="rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-[#042f2e] transition hover:bg-teal-400"
              >
                View research
              </Link>
              <Link
                href="/contact"
                className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:border-teal-500/30 hover:text-teal-100"
              >
                Join the lab
              </Link>
            </div>
          </div>
          <div className="animate-drive-in space-y-4">
            <RobotHeroCanvas />
            <p className="text-center text-xs text-zinc-500">
              URV Waveshare — drives in on a spline (pure pursuit outreach demo)
            </p>
          </div>
        </section>

        <section id="demos" className="mt-16 scroll-mt-24">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
            Interactive demos
          </p>
          <h2 className="font-display mt-2 text-2xl font-semibold text-white">
            URV Waveshare · 3D · telemetry · video
          </h2>
        </section>

        <section className="mt-10">
          <h3 className="font-display text-lg font-semibold text-white">Inspect the platform</h3>
          <p className="mt-2 text-sm text-zinc-500">Three.js scene — rotate the UGV mesh.</p>
          <div className="mt-6">
            <RobotViewer3DLoader />
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold text-white">Live telemetry preview</h2>
          <div className="mt-6 max-w-2xl">
            <TelemetryChart />
          </div>
        </section>

        <section className="mt-20">
          <h2 className="font-display text-2xl font-semibold text-white">Research themes</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {lab.themes.map((theme) => (
              <article
                key={theme.title}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-5"
              >
                <h3 className="font-display font-semibold text-teal-200">{theme.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{theme.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-20">
          <h2 className="font-display text-2xl font-semibold text-white">Simulator & sensor demos</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Add MP4s under <code className="text-teal-300/80">public/videos/</code> per slot below.
          </p>
          <div className="mt-8">
            <DemoVideoGrid />
          </div>
        </section>

        <section className="mt-20 grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">Recent highlights</h2>
            <ul className="mt-6 space-y-3">
              {lab.highlights.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-sm leading-relaxed text-zinc-400 before:mt-2 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-amber-400"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="flex items-end justify-between gap-4">
              <h2 className="font-display text-2xl font-semibold text-white">Latest news</h2>
              <Link href="/news" className="text-sm text-teal-300 hover:text-teal-200">
                All news →
              </Link>
            </div>
            <ul className="mt-6 divide-y divide-white/8 rounded-2xl border border-white/8 bg-white/[0.02]">
              {latest.map((item) => (
                <li key={item.date + item.title} className="px-5 py-4">
                  <time className="text-xs font-medium text-zinc-500">{item.date}</time>
                  <p className="mt-1 font-medium text-zinc-200">{item.title}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <RecentLabUpdates />
      </main>
    </PublicShell>
  );
}
