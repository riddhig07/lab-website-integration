import { NextResponse } from "next/server";
import { assistantAnswer } from "@/lib/meeting-hub/ai";
import { getMeetings } from "@/lib/meeting-hub/store";

export async function POST(request: Request) {
  const body = (await request.json()) as { question?: string };
  const question = body.question?.trim();
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });
  const meetings = await getMeetings();
  const result = await assistantAnswer(question, meetings);
  return NextResponse.json(result);
}
