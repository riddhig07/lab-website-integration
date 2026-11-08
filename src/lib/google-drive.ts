import { google, drive_v3 } from "googleapis";

export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string | null;
  webViewLink?: string | null;
  iconLink?: string | null;
  size?: string | null;
  isFolder: boolean;
};

function getServiceAccountAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) return null;
  const credentials = JSON.parse(raw) as object;
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/documents.readonly",
    ],
  });
}

function getOAuthClient() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirect = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!id || !secret || !redirect) return null;
  return new google.auth.OAuth2(id, secret, redirect);
}

export function driveConfigured(): boolean {
  return Boolean(
    (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) ||
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
  );
}

export function driveRootId(): string {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? "";
}

export async function getDriveClient(): Promise<drive_v3.Drive | null> {
  const refresh = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const oauth = getOAuthClient();
  if (refresh && oauth) {
    oauth.setCredentials({ refresh_token: refresh });
    return google.drive({ version: "v3", auth: oauth });
  }
  const auth = getServiceAccountAuth();
  if (!auth) return null;
  return google.drive({ version: "v3", auth });
}

export async function listDriveChildren(folderId: string): Promise<DriveItem[]> {
  const drive = await getDriveClient();
  if (!drive) throw new Error("Google Drive is not configured");

  const files: DriveItem[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, iconLink, size)",
      orderBy: "folder,name_natural",
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name || !f.mimeType) continue;
      files.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
        iconLink: f.iconLink,
        size: f.size,
        isFolder: f.mimeType === "application/vnd.google-apps.folder",
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

export async function exportDriveFileText(fileId: string, mimeType: string): Promise<string> {
  const drive = await getDriveClient();
  if (!drive) return "";

  if (mimeType === "application/vnd.google-apps.document") {
    const res = await drive.files.export({ fileId, mimeType: "text/plain" });
    return String(res.data ?? "");
  }
  if (mimeType.startsWith("text/")) {
    const res = await drive.files.get({ fileId, alt: "media" });
    return String(res.data ?? "");
  }
  return "";
}

export async function getDriveStartPageToken(): Promise<string | undefined> {
  const drive = await getDriveClient();
  if (!drive) return undefined;
  const res = await drive.changes.getStartPageToken({ supportsAllDrives: true });
  return res.data.startPageToken ?? undefined;
}

export async function listDriveChanges(pageToken: string) {
  const drive = await getDriveClient();
  if (!drive) return { changes: [], newPageToken: pageToken };
  const res = await drive.changes.list({
    pageToken,
    fields: "nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, modifiedTime, webViewLink, parents))",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 100,
  });
  return {
    changes: res.data.changes ?? [],
    newPageToken: res.data.newStartPageToken ?? res.data.nextPageToken ?? pageToken,
  };
}
