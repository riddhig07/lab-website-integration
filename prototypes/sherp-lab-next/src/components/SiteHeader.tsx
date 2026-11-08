"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { lab, navLinks } from "@/content/site";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-teal-500/10 bg-[#070b12]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 sm:px-8">
        <Link href="/" className="group flex min-w-0 flex-col" onClick={() => setOpen(false)}>
          <span className="font-display text-lg font-bold tracking-tight text-white transition-colors group-hover:text-teal-300">
            {lab.shortName}
          </span>
          <span className="truncate text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            {lab.affiliation}
          </span>
        </Link>

        <nav className="hidden max-w-[52rem] flex-wrap items-center justify-end gap-0.5 lg:flex">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-2 py-2 text-xs transition xl:px-3 xl:text-sm ${
                  active
                    ? "bg-teal-500/15 text-teal-200"
                    : "text-zinc-400 hover:bg-white/5 hover:text-teal-200"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/intranet"
            className="ml-2 rounded-lg border border-teal-500/25 bg-teal-500/10 px-3 py-2 text-sm font-medium text-teal-200 transition hover:border-teal-400/40 hover:bg-teal-500/15"
          >
            Lab intranet
          </Link>
        </nav>

        <button
          type="button"
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 lg:hidden"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          Menu
        </button>
      </div>

      {open ? (
        <nav className="border-t border-white/8 px-6 py-4 lg:hidden">
          <ul className="space-y-1">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`block rounded-lg px-3 py-2 text-sm ${
                      active ? "bg-teal-500/15 text-teal-200" : "text-zinc-300 hover:bg-white/5"
                    }`}
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                href="/intranet"
                className="block rounded-lg px-3 py-2 text-sm text-teal-300"
                onClick={() => setOpen(false)}
              >
                Lab intranet
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
