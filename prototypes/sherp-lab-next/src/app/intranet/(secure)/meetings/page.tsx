import Link from "next/link";
import { MeetingHub } from "@/components/MeetingHub";

export const metadata = { title: "Meetings" };

export default function IntranetMeetingsPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-bold text-white">Meeting notes & communication</h1>
      <p className="mt-3 max-w-2xl text-zinc-400">
        Archived agendas, weekly sync decisions, and AI note-taker / transcription storage.
      </p>
      <p className="mt-4">
        <Link
          href="/meetings"
          className="text-sm font-medium text-emerald-400 underline-offset-4 hover:underline"
        >
          Open the full Meeting Hub (Drive sync, calendar, AI assistant) →
        </Link>
      </p>
      <div className="mt-10">
        <MeetingHub />
      </div>
    </>
  );
}
