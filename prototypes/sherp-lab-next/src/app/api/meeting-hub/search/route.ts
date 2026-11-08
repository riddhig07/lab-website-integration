import { NextResponse } from "next/server";
import { searchDocuments } from "@/lib/meeting-hub/drive-sync";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchDocuments(q);
  return NextResponse.json({ results });
}
