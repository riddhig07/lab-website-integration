import { NextResponse } from "next/server";
import { driveConfigured } from "@/lib/google-drive";
import { getSyncState } from "@/lib/meeting-hub/store";

export async function GET() {
  const sync = await getSyncState();
  return NextResponse.json({
    driveConfigured: driveConfigured(),
    sync,
    oauthConfigured: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
  });
}
