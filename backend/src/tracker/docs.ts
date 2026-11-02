// Google Docs, Sheets, Slides and other Drive files linked to tasks. A file's
// name comes from the site's service account when it can see the file (and
// files inside the lab folder are readable from the portal), else from the
// member's own connected Google account, else from the kind of link.
import { db } from '../db';
import { fileMeta } from '../google/drive';
import { userAccessToken } from '../google/userAuth';
import { getTask, requireTask, TrackerError, type Task } from './tasks';

export interface DocRef {
  file_id: string;
  /** The pasted link, kept so it opens the way the member shared it. */
  url: string | null;
  /** From the link's path when nothing better is known. */
  kind: keyof typeof KINDS | null;
}

const KINDS = {
  document: { name: 'Google Doc', mime: 'application/vnd.google-apps.document' },
  spreadsheets: { name: 'Google Sheet', mime: 'application/vnd.google-apps.spreadsheet' },
  presentation: { name: 'Google Slides', mime: 'application/vnd.google-apps.presentation' },
  drawings: { name: 'Google Drawing', mime: 'application/vnd.google-apps.drawing' },
  forms: { name: 'Google Form', mime: 'application/vnd.google-apps.form' },
  folders: { name: 'Drive folder', mime: 'application/vnd.google-apps.folder' },
};

const DOCS_URL = /docs\.google\.com\/(document|spreadsheets|presentation|drawings|forms)\/(?:u\/\d+\/)?d\/(?:e\/)?([\w-]{10,})/;
const DRIVE_URL = /drive\.google\.com\/(?:(?:drive\/)?(?:u\/\d+\/)?(file|folders)\/(?:d\/)?([\w-]{10,})|(?:open|uc)\?(?:.*&)?id=([\w-]{10,}))/;
const MAX_DOCS = 30;

/** { url } (a docs.google.com or drive.google.com link) or { file_id }. */
export function parseDocRef(body: unknown): DocRef {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.file_id === 'string' && /^[\w-]{10,}$/.test(b.file_id)) return { file_id: b.file_id, url: null, kind: null };
  const url = typeof b.url === 'string' ? b.url.trim() : '';
  const docs = DOCS_URL.exec(url);
  if (docs) return { file_id: docs[2], url, kind: docs[1] as DocRef['kind'] };
  const drive = DRIVE_URL.exec(url);
  if (drive) return { file_id: drive[2] ?? drive[3], url, kind: drive[1] === 'folders' ? 'folders' : null };
  throw new TrackerError(400, 'Paste a Google Docs, Sheets, Slides or Drive link');
}

/** What the member's own Google account can see of the file, if they connected one. */
async function viaMember(userId: number, fileId: string): Promise<{ name: string; mimeType: string; webViewLink?: string } | null> {
  try {
    const { token } = await userAccessToken(userId);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${new URLSearchParams({ fields: 'name,mimeType,webViewLink', supportsAllDrives: 'true' })}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return res.ok ? ((await res.json()) as { name: string; mimeType: string; webViewLink?: string }) : null;
  } catch {
    return null;
  }
}

export async function linkDoc(taskId: number, ref: DocRef, userId: number, actor: string): Promise<Task> {
  const task = requireTask(taskId);
  if (task.docs.length >= MAX_DOCS && !task.docs.some((d) => d.file_id === ref.file_id)) throw new TrackerError(400, `At most ${MAX_DOCS} docs per task`);

  const lab = await fileMeta(ref.file_id);
  const own = lab ? null : await viaMember(userId, ref.file_id);
  const fallback = KINDS[ref.kind ?? 'document'] ?? KINDS.document;
  const name = lab?.item.name ?? own?.name ?? (ref.kind ? fallback.name : 'Drive file');
  const mime = lab?.item.mimeType ?? own?.mimeType ?? (ref.kind ? fallback.mime : 'application/octet-stream');
  const url = ref.url ?? lab?.item.webViewLink ?? own?.webViewLink ?? `https://drive.google.com/open?id=${ref.file_id}`;

  db.prepare(
    `INSERT INTO tracker_docs (task_id, file_id, name, mime_type, url, in_lab, added_by) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (task_id, file_id) DO UPDATE SET name = excluded.name, mime_type = excluded.mime_type, url = excluded.url, in_lab = excluded.in_lab`,
  ).run(taskId, ref.file_id, name.slice(0, 300), mime, url.slice(0, 2000), lab?.inLab ? 1 : 0, actor);
  return getTask(taskId)!;
}

export function unlinkDoc(taskId: number, docId: number): Task {
  if (db.prepare('DELETE FROM tracker_docs WHERE id = ? AND task_id = ?').run(docId, taskId).changes === 0) {
    throw new TrackerError(404, 'Doc not found');
  }
  return getTask(taskId)!;
}
