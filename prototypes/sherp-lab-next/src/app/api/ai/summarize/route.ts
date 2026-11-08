import { NextResponse } from "next/server";
import { generateSummary } from "@/lib/meeting-hub/ai";
import { getMeeting, upsertMeeting } from "@/lib/meeting-hub/store";

export async function POST(request: Request) {
  const body = (await request.json()) as { meetingId?: string; transcript?: string };
  if (!body.meetingId) {
    return NextResponse.json({ error: "meetingId required" }, { status: 400 });
  }
  const meeting = await getMeeting(body.meetingId);
  if (!meeting) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  const transcript = body.transcript ?? meeting.transcript?.text ?? "";
  try {
    const summary = await generateSummary(meeting, transcript);
    await upsertMeeting({ ...meeting, summary, updatedAt: new Date().toISOString() });
    return NextResponse.json({ summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Summary failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
