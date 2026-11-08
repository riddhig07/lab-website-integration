import Link from "next/link";
import { lab } from "@/content/site";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/5 bg-black/20">
      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-display text-sm font-semibold text-zinc-200">{lab.name}</p>
            <p className="mt-1 text-sm text-zinc-500">{lab.tagline}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-zinc-500">
            <Link href="/contact" className="transition hover:text-teal-300">
              Contact
            </Link>
            <Link href="/intranet" className="transition hover:text-teal-300">
              Intranet
            </Link>
            <a href={`mailto:${lab.email}`} className="transition hover:text-teal-300">
              {lab.email}
            </a>
          </div>
        </div>
        <div className="mt-8 border-t border-white/5 pt-6">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
            Design & interaction references
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
            {lab.designResources.map((r) => (
              <li key={r.href}>
                <a href={r.href} target="_blank" rel="noreferrer" className="hover:text-teal-300">
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
