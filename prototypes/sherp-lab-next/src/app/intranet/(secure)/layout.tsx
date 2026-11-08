import Link from "next/link";
import { redirect } from "next/navigation";
import {
  hasIntranetSession,
  intranetPasswordConfigured,
} from "@/lib/intranet-auth";

const intranetNav = [
  { href: "/intranet", label: "Dashboard" },
  { href: "/intranet/drive", label: "Drive" },
  { href: "/intranet/docs", label: "Docs & SOPs" },
  { href: "/intranet/git", label: "Git hub" },
  { href: "/intranet/literature", label: "Literature" },
  { href: "/intranet/projects", label: "Projects" },
  { href: "/intranet/ops", label: "Lab ops" },
  { href: "/intranet/meetings", label: "Meetings" },
] as const;

export default async function IntranetSecureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (intranetPasswordConfigured() && !(await hasIntranetSession())) {
    redirect("/intranet/login");
  }

  return (
    <div className="min-h-screen bg-[#05080f] text-zinc-100">
      <header className="border-b border-white/8 bg-black/30">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4 sm:px-8">
          <div>
            <Link href="/" className="text-xs text-zinc-500 hover:text-teal-300">
              ← Public site
            </Link>
            <p className="font-display text-lg font-semibold text-white">Lab intranet</p>
          </div>
          <nav className="flex flex-wrap gap-1">
            {intranetNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-teal-200"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-8">{children}</div>
    </div>
  );
}
