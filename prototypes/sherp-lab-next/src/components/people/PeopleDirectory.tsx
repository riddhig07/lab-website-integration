"use client";

import { useState } from "react";
import { labMembers, membersByTier, type LabMember } from "@/content/people";
import { MemberCard } from "@/components/people/MemberCard";

function MemberModal({ member, onClose }: { member: LabMember; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0a101a] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-2xl font-bold text-white">{member.name}</h2>
        <p className="text-sm font-medium text-teal-300">{member.role}</p>

        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase text-zinc-500">Biography</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{member.bio}</p>
        </section>

        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase text-zinc-500">Research interests</h3>
          <p className="mt-2 text-sm text-zinc-400">{member.interests}</p>
        </section>

        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase text-zinc-500">Projects</h3>
          {member.projects.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-sm text-zinc-400">
              {member.projects.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">To be added.</p>
          )}
        </section>

        <section className="mt-6 flex flex-wrap gap-3 text-sm">
          {member.email ? (
            <a href={`mailto:${member.email}`} className="text-teal-300 hover:underline">
              Email
            </a>
          ) : (
            <span className="text-zinc-600">Email — to be added</span>
          )}
          {member.github ? (
            <a
              href={member.github}
              target="_blank"
              rel="noreferrer"
              className="text-teal-300 hover:underline"
            >
              GitHub
            </a>
          ) : (
            <span className="text-zinc-600">GitHub — to be added</span>
          )}
          {member.linkedin ? (
            <a
              href={member.linkedin}
              target="_blank"
              rel="noreferrer"
              className="text-teal-300 hover:underline"
            >
              LinkedIn
            </a>
          ) : (
            <span className="text-zinc-600">LinkedIn — to be added</span>
          )}
        </section>

        <button
          type="button"
          onClick={onClose}
          className="mt-8 w-full rounded-xl bg-teal-500 py-2.5 text-sm font-semibold text-[#042f2e]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function PeopleDirectory() {
  const [selected, setSelected] = useState<LabMember | null>(null);
  const professors = membersByTier("professor");
  const leads = membersByTier("lead");
  const members = membersByTier("member");

  return (
    <>
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Professor
        </h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {professors.map((m) => (
            <MemberCard key={m.id} member={m} featured onSelect={setSelected} />
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Research lead
        </h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {leads.map((m) => (
            <MemberCard key={m.id} member={m} featured onSelect={setSelected} />
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Lab members
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <MemberCard key={m.id} member={m} onSelect={setSelected} />
          ))}
        </div>
      </section>

      <p className="mt-10 text-xs text-zinc-600">
        Edit all {labMembers.length} profiles in{" "}
        <code className="text-teal-300/80">src/content/people.ts</code>.
      </p>

      {selected ? <MemberModal member={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
