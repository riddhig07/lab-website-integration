import { NextResponse } from "next/server";
import { getDocuments, getMeeting, upsertMeeting } from "@/lib/meeting-hub/store";
import type { LabMeeting } from "@/lib/meeting-hub/types";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meeting = await getMeeting(id);
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const docs = await getDocuments();
  const linked = docs.filter((d) => meeting.linkedDriveFileIds.includes(d.driveFileId));
  return NextResponse.json({ meeting, documents: linked });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meeting = await getMeeting(id);
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await request.json()) as Partial<LabMeeting>;
  const next = { ...meeting, ...body, id: meeting.id, updatedAt: new Date().toISOString() };
  await upsertMeeting(next);
  return NextResponse.json({ meeting: next });
}
