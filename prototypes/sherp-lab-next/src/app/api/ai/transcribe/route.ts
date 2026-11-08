import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/meeting-hub/ai";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const text = await transcribeAudio(buffer, file.name);
    return NextResponse.json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
