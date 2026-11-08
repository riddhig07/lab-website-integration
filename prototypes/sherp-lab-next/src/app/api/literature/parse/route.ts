import { NextResponse } from "next/server";
import { parseLiteratureText } from "@/lib/parse-literature";

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim() ?? "";
  if (text.length < 20) {
    return NextResponse.json(
      { error: "Paste at least a title or abstract (20+ characters)." },
      { status: 400 },
    );
  }
  return NextResponse.json(parseLiteratureText(text));
}
