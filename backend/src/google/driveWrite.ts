// Adding to the lab's Drive folder, as the member's own Google account
// (google/userAuth.ts). Folders are checked against the lab folder first, so
// a connected account can't be used to write elsewhere in someone's Drive.
import { config } from '../config';
import { assertLabFolder, DriveError, FILE_FIELDS, FOLDER, toItem, type DriveItem, type RawFile } from './drive';
import { userAccessToken } from './userAuth';

const MAX_NAME = 255;
// Drive itself allows 5 TB; this keeps a mistaken drop from tying up the browser for hours.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

function cleanName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > MAX_NAME) throw new DriveError(400, `A name of 1-${MAX_NAME} characters is required`);
  return name;
}

const description = (login: string) => `Uploaded from the Lab Portal by ${login}.`;

/** What Google says when the member's account can't add to the folder, in words. */
async function writeError(res: Response, email: string): Promise<DriveError> {
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
  const reason = body.error?.errors?.[0]?.reason;
  if (res.status === 404 || res.status === 403) {
    if (reason === 'storageQuotaExceeded') return new DriveError(403, `${email} is out of Google Drive storage`);
    return new DriveError(403, `Your Google account (${email}) can't add files to this folder. Ask the folder's owner for edit access.`);
  }
  if (res.status === 401) return new DriveError(409, 'Reconnect your Google account to upload');
  return new DriveError(502, `Google Drive error: ${body.error?.message ?? res.status}`);
}

/**
 * Starts a resumable upload into `folderId` and returns its session URL. The
 * browser sends the file there itself, so file bytes never pass through the
 * portal (and its request size limits).
 */
export async function startUpload(
  userId: number,
  login: string,
  folderId: string,
  file: { name: unknown; mime_type?: unknown; size: unknown },
): Promise<{ upload_url: string; email: string }> {
  const name = cleanName(file.name);
  const size = Number(file.size);
  if (!Number.isInteger(size) || size < 0) throw new DriveError(400, 'size is required');
  if (size > MAX_UPLOAD_BYTES) throw new DriveError(413, 'Files over 5 GB have to be uploaded in Google Drive');
  const mimeType = typeof file.mime_type === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(file.mime_type) ? file.mime_type : 'application/octet-stream';
  await assertLabFolder(folderId);
  const { token, email } = await userAccessToken(userId);

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?${new URLSearchParams({ uploadType: 'resumable', supportsAllDrives: 'true', fields: FILE_FIELDS })}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(size),
        // The session URL accepts the browser's PUT only from this origin (CORS).
        Origin: new URL(config.siteUrl).origin,
      },
      body: JSON.stringify({ name, parents: [folderId], description: description(login) }),
    },
  );
  const location = res.headers.get('location');
  if (!res.ok || !location) throw await writeError(res, email);
  return { upload_url: location, email };
}

export async function createFolder(userId: number, login: string, parentId: string, nameValue: unknown): Promise<DriveItem> {
  const name = cleanName(nameValue);
  await assertLabFolder(parentId);
  const { token, email } = await userAccessToken(userId);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ supportsAllDrives: 'true', fields: FILE_FIELDS })}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId], description: description(login) }),
  });
  if (!res.ok) throw await writeError(res, email);
  return toItem((await res.json()) as RawFile);
}
