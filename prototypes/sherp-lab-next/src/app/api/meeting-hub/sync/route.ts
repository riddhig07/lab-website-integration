import { NextResponse } from "next/server";
import { runFullDriveSync } from "@/lib/meeting-hub/drive-sync";

export async function POST() {
  const result = await runFullDriveSync();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
