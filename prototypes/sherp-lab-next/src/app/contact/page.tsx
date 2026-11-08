import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { lab } from "@/content/site";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <PublicShell>
      <main className="mx-auto max-w-3xl px-6 py-12 sm:px-8 sm:py-16">
        <h1 className="font-display text-4xl font-bold text-white">Contact & join us</h1>
        <p className="mt-4 text-lg text-zinc-400">
          General inquiries, collaboration requests, and application information for prospective
          students and researchers.
        </p>

        <div className="mt-10 grid gap-4">
          <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
            <h2 className="font-display text-lg font-semibold text-white">General inquiries</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Questions about the lab, media, or visiting — we reply within a few business days.
            </p>
            <a
              href={`mailto:${lab.email}?subject=General%20inquiry`}
              className="mt-4 inline-block text-lg font-medium text-teal-300 hover:text-teal-200"
            >
              {lab.email}
            </a>
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
            <h2 className="font-display text-lg font-semibold text-white">
              Collaboration requests
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              Industry partners and peer labs: include your timeline, hardware constraints, IP
              expectations, and whether you need benchmark access, dataset sharing, or co-development
              on UGV stacks.
            </p>
            <a
              href={`mailto:${lab.email}?subject=Collaboration%20request`}
              className="mt-4 inline-block text-sm font-semibold text-teal-300 hover:underline"
            >
              Email collaboration proposal →
            </a>
          </section>

          <section className="rounded-2xl border border-teal-500/15 bg-teal-500/5 p-6">
            <h2 className="font-display text-lg font-semibold text-teal-100">
              Prospective students & researchers
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{lab.joinBlurb}</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-zinc-500">
              <li>Attach a CV or resume (PDF).</li>
              <li>2–3 sentences on what you want to build (sim, embedded, benchmarks, web).</li>
              <li>Optional: link to GitHub or a writing sample.</li>
            </ul>
            <a
              href={`mailto:${lab.email}?subject=Prospective%20student%20application`}
              className="mt-5 inline-block rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-[#042f2e] hover:bg-teal-400"
            >
              Apply via email
            </a>
          </section>
        </div>

        <p className="mt-8 text-sm text-zinc-500">
          Current members: use the{" "}
          <Link href="/intranet" className="text-teal-300 hover:underline">
            intranet
          </Link>{" "}
          for SOPs, Drive, literature graph, and project boards.
        </p>
      </main>
    </PublicShell>
  );
}
