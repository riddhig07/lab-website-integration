import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import {
  publicationCategoryLabels,
  publications,
  type PublicationCategory,
} from "@/content/research";

export const metadata = { title: "Publications" };

function groupPublications() {
  const groups = new Map<PublicationCategory, typeof publications>();
  for (const pub of publications) {
    const list = groups.get(pub.category) ?? [];
    list.push(pub);
    groups.set(pub.category, list);
  }
  return groups;
}

export default function PublicationsPage() {
  const pubGroups = groupPublications();

  return (
    <PublicShell>
      <main className="mx-auto max-w-4xl px-6 py-12 sm:px-8 sm:py-16">
        <h1 className="font-display text-4xl font-bold text-white">Publications</h1>
        <p className="mt-4 text-zinc-400">
          Categorized list of lab publications. Active projects and software are on{" "}
          <Link href="/research" className="text-teal-300 hover:underline">
            Research
          </Link>
          .
        </p>

        <div className="mt-12 space-y-10">
          {Array.from(pubGroups.entries()).map(([category, pubs]) => (
            <section key={category}>
              <h2 className="font-display text-xl font-semibold text-teal-200/90">
                {publicationCategoryLabels[category]}
              </h2>
              <ul className="mt-4 space-y-4">
                {pubs.map((pub) => (
                  <li
                    key={pub.title}
                    className="rounded-xl border border-white/8 bg-white/[0.02] px-5 py-4"
                  >
                    <p className="font-medium text-zinc-100">{pub.title}</p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {pub.authors} · {pub.venue} · {pub.year}
                    </p>
                    {pub.href ? (
                      <a href={pub.href} className="mt-2 inline-block text-sm text-teal-300">
                        Read →
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </PublicShell>
  );
}
