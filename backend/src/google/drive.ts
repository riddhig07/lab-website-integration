// Read-only access to the lab's Google Drive folder (files, who made and last
// changed them, sharing, activity), as the site's service account. Only files inside GOOGLE_DRIVE_FOLDER_ID are served: the service
// account may see other things shared with it, so every request is checked
// against the folder tree (see pathTo).
import { createSign } from 'node:crypto';
import { config } from '../config';

export const FOLDER = 'application/vnd.google-apps.folder';
const SHORTCUT = 'application/vnd.google-apps.shortcut';
const USER_FIELDS = 'displayName,emailAddress,permissionId';
export const FILE_FIELDS = `id,name,mimeType,size,createdTime,modifiedTime,description,shared,iconLink,webViewLink,shortcutDetails,owners(${USER_FIELDS}),lastModifyingUser(${USER_FIELDS})`;

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

export interface DriveUser {
  name: string;
  email: string | null;
}

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size: number | null;
  createdTime: string | null;
  modifiedTime: string;
  /** Who owns it. For a copy that is whoever made the copy; null in shared drives (no single owner). */
  owner: DriveUser | null;
  lastModifiedBy: DriveUser | null;
  /** Shared with anyone besides the owner. */
  shared: boolean;
  description: string | null;
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

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const ACTIVITY_SCOPE = 'https://www.googleapis.com/auth/drive.activity.readonly';
const tokens = new Map<string, { value: string; expiresAt: number }>();

async function accessToken(scope = DRIVE_SCOPE): Promise<string> {
  const cachedToken = tokens.get(scope);
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const key = JSON.parse(Buffer.from(serviceAccountKey, 'base64').toString()) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
    iss: key.client_email,
    scope,
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
  tokens.set(scope, { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
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

interface RawUser {
  displayName?: string;
  emailAddress?: string;
  permissionId?: string;
}

export interface RawFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime: string;
  description?: string;
  shared?: boolean;
  owners?: RawUser[];
  lastModifyingUser?: RawUser;
  iconLink?: string;
  webViewLink?: string;
  parents?: string[];
  shortcutDetails?: { targetId: string };
}

function toUser(u: RawUser | undefined): DriveUser | null {
  if (!u) return null;
  return { name: u.displayName || u.emailAddress || 'Unknown', email: u.emailAddress ?? null };
}

export function toItem(f: RawFile): DriveItem {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    isFolder: f.mimeType === FOLDER,
    size: f.size ? Number(f.size) : null,
    createdTime: f.createdTime ?? null,
    modifiedTime: f.modifiedTime,
    owner: toUser(f.owners?.[0]),
    lastModifiedBy: toUser(f.lastModifyingUser),
    shared: Boolean(f.shared),
    description: f.description || null,
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

/** 404 unless `id` is a folder inside the lab folder. */
export async function assertLabFolder(id: string): Promise<void> {
  await pathTo(id);
  if (!(await node(id)).isFolder) throw new DriveError(404, 'Not a folder');
}

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

/**
 * Any file the service account can see (shared with it, not only in the lab
 * folder) and whether it's inside the lab folder; null when it can't see it.
 */
export async function fileMeta(id: string): Promise<{ item: DriveItem; inLab: boolean } | null> {
  if (!driveEnabled) return null;
  try {
    const f = (await (await drive(`files/${encodeURIComponent(id)}`, { fields: FILE_FIELDS })).json()) as RawFile;
    const inLab = await pathTo(id).then(
      () => true,
      () => false,
    );
    return { item: toItem(f), inLab };
  } catch (err) {
    if (err instanceof DriveError && err.status === 404) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Search and reading, for the portal's assistant

export type DriveKind = 'doc' | 'sheet' | 'slides' | 'pdf' | 'image' | 'folder';

const KIND_QUERY: Record<DriveKind, string> = {
  doc: "mimeType = 'application/vnd.google-apps.document'",
  sheet: "mimeType = 'application/vnd.google-apps.spreadsheet'",
  slides: "mimeType = 'application/vnd.google-apps.presentation'",
  pdf: "mimeType = 'application/pdf'",
  image: "mimeType contains 'image/'",
  folder: `mimeType = '${FOLDER}'`,
};

export const DRIVE_KINDS = Object.keys(KIND_QUERY) as DriveKind[];

export interface SearchOptions {
  kind?: DriveKind;
  /** Only files somewhere inside this lab folder. */
  folderId?: string;
  /** Owner's email address. */
  owner?: string;
  /** ISO date or datetime. */
  createdAfter?: string;
  modifiedAfter?: string;
  orderBy?: 'modified' | 'created' | 'name';
}

const quote = (v: string) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function isoDate(value: string): string {
  const t = Date.parse(value);
  if (Number.isNaN(t)) throw new DriveError(400, `"${value}" is not a date`);
  return new Date(t).toISOString();
}

/**
 * Files and folders in the lab folder, matched by name or text (`query`) and/or
 * by type, folder, owner and dates. Without `query` it lists by those filters,
 * newest first.
 */
export async function searchDrive(query: string | undefined, limit = 25, opts: SearchOptions = {}): Promise<(DriveItem & { path: string })[]> {
  const terms = ['trashed = false'];
  if (query) terms.push(`(name contains '${quote(query)}' or fullText contains '${quote(query)}')`);
  if (opts.kind) terms.push(KIND_QUERY[opts.kind]);
  if (opts.owner) {
    if (!/^[^\s'\\]+@[^\s'\\]+$/.test(opts.owner)) throw new DriveError(400, 'owner must be an email address');
    terms.push(`'${opts.owner}' in owners`);
  }
  if (opts.createdAfter) terms.push(`createdTime > '${isoDate(opts.createdAfter)}'`);
  if (opts.modifiedAfter) terms.push(`modifiedTime > '${isoDate(opts.modifiedAfter)}'`);
  if (opts.folderId) await pathTo(opts.folderId);
  const orderBy = { modified: 'modifiedTime desc', created: 'createdTime desc', name: 'name_natural' }[opts.orderBy ?? (query ? 'name' : 'modified')];

  const found: (DriveItem & { path: string })[] = [];
  let pageToken: string | undefined;
  // The service account may see things outside the lab folder; those are
  // dropped, so keep paging until enough lab files are found.
  for (let page = 0; page < 5 && found.length < limit; page++) {
    const res = await drive('files', {
      q: terms.join(' and '),
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      pageSize: '100',
      corpora: 'allDrives',
      includeItemsFromAllDrives: 'true',
      // With a text query, Google's own relevance order is the default.
      ...(query && !opts.orderBy ? {} : { orderBy }),
      ...(pageToken ? { pageToken } : {}),
    });
    const body = (await res.json()) as { files: RawFile[]; nextPageToken?: string };
    const inside = await Promise.all(
      body.files.map(async (f) => {
        try {
          const path = await pathTo(f.id);
          if (opts.folderId && !path.some((p) => p.id === opts.folderId)) return null;
          return { ...toItem(f), path: path.map((p) => p.name).join(' / ') };
        } catch {
          return null;
        }
      }),
    );
    found.push(...inside.filter((f) => f !== null));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return found.slice(0, limit);
}

/** Everything under a folder, subfolders included (breadth first), each with its folder path. */
export async function walkFolder(id: string, { maxItems = 500, maxFolders = 80 } = {}): Promise<{ items: (DriveItem & { path: string })[]; truncated: boolean }> {
  const start = await listFolder(id);
  const items: (DriveItem & { path: string })[] = [];
  const queue = [{ id, path: start.path.map((p) => p.name).join(' / '), listing: start.items as DriveItem[] | null }];
  let truncated = false;
  for (let folders = 0; queue.length && !truncated; folders++) {
    if (folders >= maxFolders) {
      truncated = true;
      break;
    }
    const cur = queue.shift()!;
    const listing = cur.listing ?? (await listFolder(cur.id)).items;
    for (const item of listing) {
      if (items.length >= maxItems) {
        truncated = true;
        break;
      }
      items.push({ ...item, path: cur.path });
      if (item.isFolder) queue.push({ id: item.id, path: `${cur.path} / ${item.name}`, listing: null });
    }
  }
  return { items, truncated };
}

// ---------------------------------------------------------------------------
// One file in depth: who made it, who can see it, its history

export interface FileDetails {
  item: DriveItem;
  /** Folder path from the lab folder, ending with the file itself. */
  path: string;
  trashed: boolean;
  inSharedDrive: boolean;
  /** Who it is shared with; null when the service account isn't allowed to list that (it needs edit access). */
  sharedWith: { type: string; role: string; name: string | null; email: string | null }[] | null;
  /** The oldest saved versions; null if Drive won't list them for this file. */
  revisions: { count: number; earliest: { time: string; by: DriveUser | null }[] } | null;
}

export async function fileDetails(id: string): Promise<FileDetails> {
  const path = (await pathTo(id)).map((p) => p.name).join(' / ');
  const f = (await (await drive(`files/${encodeURIComponent(id)}`, { fields: `${FILE_FIELDS},driveId,trashed` })).json()) as RawFile & { driveId?: string; trashed?: boolean };

  const sharedWith = await drive(`files/${encodeURIComponent(id)}/permissions`, { fields: 'permissions(type,role,displayName,emailAddress,domain)', pageSize: '100' }).then(
    async (res) => {
      const { permissions = [] } = (await res.json()) as { permissions?: { type: string; role: string; displayName?: string; emailAddress?: string; domain?: string }[] };
      return permissions.map((p) => ({ type: p.type, role: p.role, name: p.displayName ?? p.domain ?? null, email: p.emailAddress ?? null }));
    },
    () => null,
  );
  const revisions = await drive(`files/${encodeURIComponent(id)}/revisions`, { fields: `revisions(modifiedTime,lastModifyingUser(${USER_FIELDS}))`, pageSize: '200' }).then(
    async (res) => {
      const { revisions: list = [] } = (await res.json()) as { revisions?: { modifiedTime: string; lastModifyingUser?: RawUser }[] };
      return list.length ? { count: list.length, earliest: list.slice(0, 3).map((r) => ({ time: r.modifiedTime, by: toUser(r.lastModifyingUser) })) } : null;
    },
    () => null,
  );
  return { item: toItem(f), path, trashed: Boolean(f.trashed), inSharedDrive: Boolean(f.driveId), sharedWith, revisions };
}

// ---------------------------------------------------------------------------
// Activity (Google's Drive Activity API): creations, copies, edits, renames,
// moves, deletions and sharing changes, with who did them. It is a separate
// API that has to be enabled for the Google Cloud project, so every caller
// handles it being unavailable.

export type ActivityAction = 'create' | 'edit' | 'move' | 'rename' | 'delete' | 'restore' | 'permission_change' | 'comment' | 'other';
export const ACTIVITY_ACTIONS: ActivityAction[] = ['create', 'edit', 'move', 'rename', 'delete', 'restore', 'permission_change', 'comment', 'other'];

export interface ActivityEvent {
  time: string;
  action: ActivityAction;
  /** In words: "created as a copy of X", "renamed from A to B", … */
  detail: string;
  actors: string[];
  file: { id: string; title: string } | null;
}

export type ActivityResult = { available: true; events: ActivityEvent[]; truncated: boolean } | { available: false; reason: string };

interface RawActor {
  user?: { knownUser?: { personName?: string; isCurrentUser?: boolean }; deletedUser?: object; unknownUser?: object };
  administrator?: object;
  system?: object;
  impersonation?: object;
  anonymous?: object;
}
interface RawActivity {
  timestamp?: string;
  timeRange?: { endTime?: string };
  primaryActionDetail?: Record<string, any>;
  actors?: RawActor[];
  targets?: { driveItem?: { name?: string; title?: string; owner?: { user?: { knownUser?: { personName?: string } } } } }[];
}

const ACTION_KEYS: Record<string, ActivityAction> = {
  create: 'create',
  edit: 'edit',
  move: 'move',
  rename: 'rename',
  delete: 'delete',
  restore: 'restore',
  permissionChange: 'permission_change',
  comment: 'comment',
};

// Drive Activity names people by a Google account id ("people/123…"), which
// Drive listings don't show. It is learned from the activity itself: a file's
// owner (known from Drive) is named in the same ids, and whoever created a
// file owns it.
const personIds = new Map<string, DriveUser>();
const fileOwners = new Map<string, DriveUser>();
let ownersLoadedAt = 0;

/** Who owns the lab's files, by file id. */
async function loadOwners(): Promise<void> {
  if (Date.now() - ownersLoadedAt < 10 * 60 * 1000) return;
  ownersLoadedAt = Date.now();
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = await drive('files', {
      q: 'trashed = false',
      fields: `nextPageToken,files(id,owners(${USER_FIELDS}))`,
      orderBy: 'modifiedTime desc',
      pageSize: '1000',
      corpora: 'allDrives',
      includeItemsFromAllDrives: 'true',
      ...(pageToken ? { pageToken } : {}),
    }).catch(() => null);
    if (!res) return;
    const body = (await res.json()) as { files: RawFile[]; nextPageToken?: string };
    for (const f of body.files) {
      const owner = toUser(f.owners?.[0]);
      if (owner) fileOwners.set(f.id, owner);
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
}

const personId = (name: string | undefined) => name?.replace(/^people\//, '');
const itemId = (item: { name?: string } | undefined) => item?.name?.replace(/^items\//, '');

/** Match account ids to people from these activities. */
function learnPeople(activities: RawActivity[]): void {
  for (const a of activities) {
    const item = a.targets?.[0]?.driveItem;
    const owner = itemId(item) ? fileOwners.get(itemId(item)!) : undefined;
    if (!owner) continue;
    const ownerId = personId(item?.owner?.user?.knownUser?.personName);
    if (ownerId) personIds.set(ownerId, owner);
    // Creating, copying or uploading a file makes you its owner.
    if (a.primaryActionDetail && 'create' in a.primaryActionDetail && a.actors?.length === 1) {
      const creator = personId(a.actors[0].user?.knownUser?.personName);
      if (creator && !personIds.has(creator)) personIds.set(creator, owner);
    }
  }
}

function actorName(a: RawActor): string {
  const known = a.user?.knownUser;
  if (known?.personName) {
    const person = personIds.get(personId(known.personName)!);
    if (person) return person.email ? `${person.name} <${person.email}>` : person.name;
    return known.isCurrentUser ? "the portal's service account" : `a Google user not matched to a file owner (${known.personName})`;
  }
  if (a.user?.deletedUser) return 'a deleted user';
  if (a.user) return 'an unknown user';
  if (a.administrator) return 'a Google Workspace admin';
  if (a.system) return 'Google (automatic)';
  if (a.impersonation) return "someone acting on a user's behalf";
  return 'an anonymous viewer';
}

function describe(kind: string, d: Record<string, any>): string {
  switch (kind) {
    case 'create':
      if (d.copy) return `created as a copy of "${d.copy.originalObject?.driveItem?.title ?? 'another file'}"`;
      if (d.upload) return 'uploaded';
      return 'created';
    case 'rename':
      return `renamed from "${d.oldTitle ?? '?'}" to "${d.newTitle ?? '?'}"`;
    case 'move': {
      const names = (parents: { driveItem?: { title?: string } }[] | undefined) =>
        (parents ?? []).map((p) => p.driveItem?.title).filter(Boolean).join(', ');
      return `moved${names(d.removedParents) ? ` from ${names(d.removedParents)}` : ''}${names(d.addedParents) ? ` to ${names(d.addedParents)}` : ''}`;
    }
    case 'delete':
      return d.type === 'PERMANENT_DELETE' ? 'permanently deleted' : 'moved to trash';
    case 'restore':
      return 'restored from trash';
    case 'permissionChange':
      return 'changed sharing';
    case 'comment':
      return 'commented';
    case 'edit':
      return 'edited';
    default:
      return kind;
  }
}

/**
 * Recent activity on a file, or on everything under a folder (default: the lab
 * folder), newest first.
 */
export async function driveActivity(
  opts: { fileId?: string; folderId?: string; sinceDays?: number; actions?: ActivityAction[]; limit?: number } = {},
): Promise<ActivityResult> {
  const limit = opts.limit ?? 50;
  const target = opts.fileId ?? opts.folderId ?? rootId;
  await pathTo(target);
  await loadOwners();

  const wanted = opts.actions?.length ? new Set(opts.actions) : null;
  const filter = [
    opts.sinceDays ? `time >= ${Date.now() - opts.sinceDays * 86_400_000}` : '',
    // Google's server-side action filter is only used in the one form that is certain; the rest is filtered below.
    wanted?.size === 1 ? `detail.action_detail_case:${[...wanted][0].toUpperCase()}` : '',
  ]
    .filter(Boolean)
    .join(' AND ');

  const kept: RawActivity[] = [];
  let pageToken: string | undefined;
  let more = false;
  for (let page = 0; page < 5; page++) {
    const res = await fetch('https://driveactivity.googleapis.com/v2/activity:query', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken(ACTIVITY_SCOPE)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(opts.fileId ? { itemName: `items/${opts.fileId}` } : { ancestorName: `items/${target}` }),
        pageSize: 100,
        ...(filter ? { filter } : {}),
        ...(pageToken ? { pageToken } : {}),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; details?: { reason?: string }[] } };
      const disabled = body.error?.details?.some((d) => d.reason === 'SERVICE_DISABLED');
      return {
        available: false,
        reason: disabled
          ? "The Drive Activity API isn't enabled for the site's Google Cloud project (APIs & Services → Library → Google Drive Activity API → Enable). Until it is, only each file's owner, creation date and last editor are available."
          : `Drive Activity isn't available: ${body.error?.message ?? res.status}`,
      };
    }
    const body = (await res.json()) as { activities?: RawActivity[]; nextPageToken?: string };
    for (const a of body.activities ?? []) {
      const key = Object.keys(a.primaryActionDetail ?? {})[0] ?? 'other';
      if (!wanted || wanted.has(ACTION_KEYS[key] ?? 'other')) kept.push(a);
    }
    pageToken = body.nextPageToken;
    if (kept.length >= limit || !pageToken) {
      more = Boolean(pageToken) || kept.length > limit;
      break;
    }
  }

  learnPeople(kept);
  const events = kept.slice(0, limit).map((a): ActivityEvent => {
    const key = Object.keys(a.primaryActionDetail ?? {})[0] ?? 'other';
    const item = a.targets?.[0]?.driveItem;
    return {
      time: a.timestamp ?? a.timeRange?.endTime ?? '',
      action: ACTION_KEYS[key] ?? 'other',
      detail: describe(key, a.primaryActionDetail?.[key] ?? {}),
      actors: (a.actors ?? []).map(actorName),
      file: itemId(item) ? { id: itemId(item)!, title: item?.title ?? '' } : null,
    };
  });
  return { available: true, events, truncated: more };
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
