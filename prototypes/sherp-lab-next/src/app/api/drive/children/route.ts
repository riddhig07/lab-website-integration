import { NextResponse } from "next/server";
import {
  driveConfigured,
  driveRootId,
  listDriveChildren,
} from "@/lib/google-drive";

export async function GET(request: Request) {
  if (!driveConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        error:
          "Set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_ROOT_FOLDER_ID. Share the lab folder with the service account email.",
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("folderId");
  const folderId = !raw || raw === "root" ? driveRootId() : raw;

  if (!folderId) {
    return NextResponse.json({ error: "Missing folderId" }, { status: 400 });
  }

  try {
    const items = await listDriveChildren(folderId);
    const folders = items.filter((i) => i.isFolder);
    const files = items.filter((i) => !i.isFolder);
    return NextResponse.json({
      configured: true,
      folderId,
      folders,
      files,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Drive API error";
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}
