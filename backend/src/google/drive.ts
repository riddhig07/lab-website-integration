// Read-only access to the lab's Google Drive folder, as the site's service
// account. Only files inside GOOGLE_DRIVE_FOLDER_ID are served: the service
// account may see other things shared with it, so every request is checked
// against the folder tree (see pathTo).
import { createSign } from 'node:crypto';
import { config } from '../config';

const FOLDER = 'application/vnd.google-apps.folder';
const SHORTCUT = 'application/vnd.google-apps.shortcut';
const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,iconLink,webViewLink,shortcutDetails';

const { serviceAccountKey, driveFolderId: rootId } = config.google;

export const driveEnabled = Boolean(serviceAccountKey && rootId);

export class DriveError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size: number | null;
  modifiedTime: string;
  iconLink: string | null;
  webViewLink: string | null;
  /** For shortcuts: where they point. Opened in Drive, not browsed. */
  targetId: string | null;
}

export interface PathEntry {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Auth: a service-account JWT exchanged for an hour-long access token.

let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;

  const key = JSON.parse(Buffer.from(serviceAccountKey, 'base64').toString()) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!body.access_token) throw new DriveError(502, `Google sign-in failed: ${body.error ?? res.status}`);
  token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function drive(path: string, params: Record<string, string> = {}): Promise<Response> {
  const url = `https://www.googleapis.com/drive/v3/${path}?${new URLSearchParams({ supportsAllDrives: 'true', ...params })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (res.status === 404) throw new DriveError(404, 'Not found');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new DriveError(502, `Google Drive error: ${body.error?.message ?? res.status}`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Folder tree

interface RawFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  iconLink?: string;
  webViewLink?: string;
  parents?: string[];
  shortcutDetails?: { targetId: string };
}

function toItem(f: RawFile): DriveItem {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    isFolder: f.mimeType === FOLDER,
    size: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime,
    iconLink: f.iconLink ?? null,
    webViewLink: f.webViewLink ?? null,
    targetId: f.mimeType === SHORTCUT ? (f.shortcutDetails?.targetId ?? null) : null,
  };
}

// Folder names and parents change rarely; caching them keeps the per-request
// ancestry check to a handful of API calls at most.
const NODE_TTL_MS = 5 * 60 * 1000;
const nodes = new Map<string, { name: string; isFolder: boolean; parents: string[]; at: number }>();

async function node(id: string) {
  const cached = nodes.get(id);
  if (cached && Date.now() - cached.at < NODE_TTL_MS) return cached;
  const f = (await (await drive(`files/${encodeURIComponent(id)}`, { fields: 'id,name,mimeType,parents' })).json()) as RawFile;
  const entry = { name: f.name, isFolder: f.mimeType === FOLDER, parents: f.parents ?? [], at: Date.now() };
  nodes.set(id, entry);
  return entry;
}

/**
 * The folders from the root down to `id` (inclusive), or a 404 if `id` is not
 * inside the root folder.
 */
export async function pathTo(id: string): Promise<PathEntry[]> {
  const path: PathEntry[] = [];
  let current = id;
  // Drive folders can't nest anywhere near this deep; the cap stops a loop.
  for (let depth = 0; depth < 50; depth++) {
    const n = await node(current);
    path.unshift({ id: current, name: n.name });
    if (current === rootId) return path;
    if (n.parents.length === 0) break;
    current = n.parents[0];
  }
  throw new DriveError(404, 'Not found');
}

export const driveRootId = () => rootId;

/** Everything directly inside a folder: folders first, then by name. Checked against the root first. */
export async function listFolder(id: string): Promise<{ path: PathEntry[]; items: DriveItem[] }> {
  const path = await pathTo(id);
  if (!(await node(id)).isFolder) throw new DriveError(404, 'Not a folder');
  const items: DriveItem[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive('files', {
      q: `'${id.replace(/'/g, "\\'")}' in parents and trashed = false`,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      orderBy: 'folder,name_natural',
      pageSize: '1000',
      includeItemsFromAllDrives: 'true',
      ...(pageToken ? { pageToken } : {}),
    });
    const body = (await res.json()) as { files: RawFile[]; nextPageToken?: string };
    items.push(...body.files.map(toItem));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return { path, items };
}

// ---------------------------------------------------------------------------
// Downloads. Google Docs, Sheets, etc. have no file to download, so they are
// exported to the closest common format.

const EXPORTS: Record<string, { mimeType: string; ext: string }> = {
  'application/vnd.google-apps.document': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ext: 'pptx',
  },
  'application/vnd.google-apps.drawing': { mimeType: 'application/pdf', ext: 'pdf' },
};

export interface Download {
  filename: string;
  mimeType: string;
  body: ReadableStream<Uint8Array>;
}

/** The file's contents, or its export for Google Docs and friends. Checked against the root first. */
export async function download(id: string): Promise<Download> {
  await pathTo(id);
  const f = (await (await drive(`files/${encodeURIComponent(id)}`, { fields: 'id,name,mimeType' })).json()) as RawFile;

  if (f.mimeType === FOLDER || f.mimeType === SHORTCUT) throw new DriveError(400, 'Folders and shortcuts cannot be downloaded');
  const exp = EXPORTS[f.mimeType];
  if (!exp && f.mimeType.startsWith('application/vnd.google-apps.')) throw new DriveError(400, 'This kind of file can only be opened in Google Drive');

  const res = exp
    ? await drive(`files/${encodeURIComponent(id)}/export`, { mimeType: exp.mimeType })
    : await drive(`files/${encodeURIComponent(id)}`, { alt: 'media' });
  return {
    filename: exp ? `${f.name}.${exp.ext}` : f.name,
    mimeType: exp?.mimeType ?? f.mimeType,
    body: res.body!,
  };
}

// ---------------------------------------------------------------------------
// Search and reading, for the portal's assistant

/** Files and folders in the lab folder whose name or text matches `query`. */
export async function searchDrive(query: string, limit = 25): Promise<(DriveItem & { path: string })[]> {
  const q = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const res = await drive('files', {
    q: `(name contains '${q}' or fullText contains '${q}') and trashed = false`,
    fields: `files(${FILE_FIELDS})`,
    pageSize: '100',
    corpora: 'allDrives',
    includeItemsFromAllDrives: 'true',
  });
  const { files } = (await res.json()) as { files: RawFile[] };
  // The service account may see things outside the lab folder; drop them.
  const inside = await Promise.all(
    files.map(async (f) => {
      try {
        const path = await pathTo(f.id);
        return { ...toItem(f), path: path.map((p) => p.name).join(' / ') };
      } catch {
        return null;
      }
    }),
  );
  return inside.filter((f) => f !== null).slice(0, limit);
}

/** Google formats exported as text the model can read. */
const TEXT_EXPORTS: Record<string, { mimeType: string; note?: string }> = {
  'application/vnd.google-apps.document': { mimeType: 'text/markdown' },
  'application/vnd.google-apps.spreadsheet': { mimeType: 'text/csv', note: 'First sheet only, as CSV.' },
  'application/vnd.google-apps.presentation': { mimeType: 'text/plain' },
};

const TEXT_TYPES = /^(text\/|application\/(json|xml|x-yaml|yaml|javascript|x-sh|x-python|x-tex|sql|toml))/;
const TEXT_EXTENSIONS = /\.(md|txt|csv|tsv|json|ya?ml|toml|xml|html?|css|js|ts|tsx|jsx|py|ipynb|sh|r|m|c|h|cpp|hpp|java|go|rs|tex|bib|sql|log|cfg|ini)$/i;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 10 * 1024 * 1024;

export type FileContent = Omit<DriveItem, 'iconLink' | 'targetId'> & { path: string; note?: string } & (
    | { kind: 'text'; text: string }
    | { kind: 'pdf' | 'image'; base64: string; mediaType: string }
    | { kind: 'unsupported'; reason: string }
  );

/** A file's contents as text (Docs, Sheets, Slides, text files) or bytes (PDFs, images). Checked against the root first. */
export async function readFile(id: string): Promise<FileContent> {
  const path = (await pathTo(id)).map((p) => p.name).join(' / ');
  const f = (await (await drive(`files/${encodeURIComponent(id)}`, { fields: FILE_FIELDS })).json()) as RawFile;
  const { iconLink: _, targetId: __, ...item } = toItem(f);
  const base = { ...item, path };
  const size = item.size ?? 0;
  const bytes = async () => Buffer.from(await (await drive(`files/${encodeURIComponent(id)}`, { alt: 'media' })).arrayBuffer());

  if (item.isFolder) return { ...base, kind: 'unsupported', reason: 'This is a folder; list it instead.' };
  const exp = TEXT_EXPORTS[f.mimeType];
  if (exp) {
    const res = await drive(`files/${encodeURIComponent(id)}/export`, { mimeType: exp.mimeType });
    return { ...base, kind: 'text', text: await res.text(), note: exp.note };
  }
  if (f.mimeType.startsWith('application/vnd.google-apps.')) return { ...base, kind: 'unsupported', reason: 'This kind of Google file can only be opened in Drive.' };
  if (f.mimeType === 'application/pdf') {
    if (size > MAX_PDF_BYTES) return { ...base, kind: 'unsupported', reason: 'PDF is over 20 MB.' };
    return { ...base, kind: 'pdf', base64: (await bytes()).toString('base64'), mediaType: 'application/pdf' };
  }
  if (IMAGE_TYPES.has(f.mimeType)) {
    if (size > MAX_IMAGE_BYTES) return { ...base, kind: 'unsupported', reason: 'Image is over 5 MB.' };
    return { ...base, kind: 'image', base64: (await bytes()).toString('base64'), mediaType: f.mimeType };
  }
  if (TEXT_TYPES.test(f.mimeType) || TEXT_EXTENSIONS.test(f.name)) {
    if (size > MAX_TEXT_BYTES) return { ...base, kind: 'unsupported', reason: 'File is over 10 MB.' };
    return { ...base, kind: 'text', text: (await bytes()).toString('utf8') };
  }
  return { ...base, kind: 'unsupported', reason: `Can't read ${f.mimeType} files here (Word, Excel and PowerPoint uploads included); open it in Drive.` };
}
