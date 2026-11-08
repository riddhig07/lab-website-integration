import Link from "next/link";

const links = [
  { href: "/meetings", label: "Meetings" },
  { href: "/lab-drive", label: "Lab Drive" },
  { href: "/ai-note-taker", label: "AI Note Taker" },
  { href: "/calendar", label: "Calendar" },
] as const;

export function HubSubNav({ active }: { active: string }) {
  return (
    <nav className="mb-8 flex flex-wrap gap-2 border-b border-white/8 pb-4">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`rounded-lg px-3 py-2 text-sm transition ${
            active === l.href
              ? "bg-teal-500/15 text-teal-200"
              : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
