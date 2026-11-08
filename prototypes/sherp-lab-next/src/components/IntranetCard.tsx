import Link from "next/link";

type Props = {
  title: string;
  description: string;
  href?: string;
  external?: boolean;
  badge?: string;
};

export function IntranetCard({ title, description, href, external, badge }: Props) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-zinc-100">{title}</h3>
        {badge ? (
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-500">{description}</p>
      {href ? (
        <span className="mt-4 inline-block text-sm font-medium text-teal-300">
          Open →
        </span>
      ) : null}
    </>
  );

  const className =
    "block rounded-2xl border border-white/8 bg-white/[0.03] p-5 transition hover:border-teal-500/25 hover:bg-white/[0.05]";

  if (!href) {
    return <div className={className}>{inner}</div>;
  }

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}
