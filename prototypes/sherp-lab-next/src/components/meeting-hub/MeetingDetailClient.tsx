"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DriveDocumentRecord, LabMeeting } from "@/lib/meeting-hub/types";

export function MeetingDetailClient({ meetingId }: { meetingId: string }) {
  const [meeting, setMeeting] = useState<LabMeeting | null>(null);
  const [documents, setDocuments] = useState<DriveDocumentRecord[]>([]);

  useEffect(() => {
    fetch(`/api/meeting-hub/meetings/${meetingId}`)
      .then((r) => r.json())
      .then((d: { meeting: LabMeeting; documents: DriveDocumentRecord[] }) => {
        setMeeting(d.meeting);
        setDocuments(d.documents ?? []);
      });
  }, [meetingId]);

  async function approveSummary() {
    if (!meeting?.summary) return;
    const summary = { ...meeting.summary, approved: true, approvedAt: new Date().toISOString(), needsReview: false };
    const res = await fetch(`/api/meeting-hub/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    });
    const data = await res.json();
    setMeeting(data.meeting);
  }

  if (!meeting) return <p className="text-sm text-zinc-500">Loading meeting…</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/meetings" className="text-sm text-zinc-500 hover:text-teal-300">
          ← All meetings
        </Link>
        <h1 className="font-display mt-2 text-3xl font-bold text-white">{meeting.title}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {meeting.dateKey} · Pacific Time · ID {meeting.id}
        </p>
      </div>

      <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <h2 className="font-display font-semibold text-white">Agenda</h2>
        <p className="mt-2 text-sm text-zinc-400 whitespace-pre-wrap">
          {meeting.agendaPreview ?? "No agenda linked yet — sync Drive or attach a document."}
        </p>
      </section>

      <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <h2 className="font-display font-semibold text-white">Google Drive documents</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {documents.length === 0 ? (
            <li className="text-zinc-600">No linked documents — check filename date or link manually (coming soon).</li>
          ) : (
            documents.map((d) => (
              <li key={d.driveFileId} className="flex flex-wrap justify-between gap-2 rounded-lg border border-white/6 px-3 py-2">
                <span className="text-zinc-300">
                  {d.name} <span className="text-zinc-600">({d.kind})</span>
                </span>
                {d.webViewLink ? (
                  <a href={d.webViewLink} target="_blank" rel="noreferrer" className="text-teal-300">
                    Open →
                  </a>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>

      {meeting.summary ? (
        <section className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-5">
          <h2 className="font-display font-semibold text-teal-100">AI summary</h2>
          <p className="mt-3 text-sm text-zinc-300">{meeting.summary.overview}</p>
          {!meeting.summary.approved ? (
            <button type="button" onClick={approveSummary} className="mt-4 rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-[#042f2e]">
              Approve for internal dashboard
            </button>
          ) : (
            <p className="mt-2 text-xs text-teal-300">Approved for lab dashboard updates.</p>
          )}
        </section>
      ) : null}

      {meeting.transcript?.text ? (
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
          <h2 className="font-display font-semibold text-white">Transcript</h2>
          <pre className="mt-3 max-h-96 overflow-auto text-sm text-zinc-400 whitespace-pre-wrap">
            {meeting.transcript.text}
          </pre>
        </section>
      ) : null}

      <Link href={`/ai-note-taker`} className="inline-block text-sm text-teal-300 hover:underline">
        Record or transcribe this meeting →
      </Link>
    </div>
  );
}
