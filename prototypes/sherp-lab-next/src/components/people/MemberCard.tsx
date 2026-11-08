"use client";

import type { LabMember } from "@/content/people";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type Props = {
  member: LabMember;
  featured?: boolean;
  onSelect: (member: LabMember) => void;
};

export function MemberCard({ member, featured, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(member)}
      className={`group w-full rounded-2xl border border-white/8 bg-white/[0.03] p-5 text-left transition hover:border-teal-500/30 hover:bg-white/[0.05] ${
        featured ? "sm:p-6" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        {member.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.photoUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div
            className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/35 to-slate-800 font-display font-bold text-teal-100 ${
              featured ? "h-16 w-16 text-lg" : "h-14 w-14 text-base"
            }`}
          >
            {initials(member.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3
            className={`font-display font-semibold text-white group-hover:text-teal-200 ${
              featured ? "text-xl" : "text-lg"
            }`}
          >
            {member.name}
          </h3>
          <p className="text-sm font-medium text-teal-300/90">{member.role}</p>
          <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{member.bio}</p>
        </div>
      </div>
      <p className="mt-4 text-xs text-zinc-600">Click for full profile →</p>
    </button>
  );
}
