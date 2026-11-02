// The assistant's Lab Drive tools: browse, search and read the lab's Google
// Drive folder, and find out who made, changed and shared its files. Read-only,
// as the site's service account. Only files inside the lab folder are
// reachable (google/drive.ts checks every id).
import {
  ACTIVITY_ACTIONS,
  DRIVE_KINDS,
  driveActivity,
  driveEnabled,
  driveRootId,
  fileDetails,
  listFolder,
  readFile,
  searchDrive,
  walkFolder,
  type ActivityAction,
  type DriveItem,
  type DriveKind,
  type DriveUser,
} from '../google/drive';
import { clamp, excerpt, formatBytes, list, plural, str, VIEW_ROWS, type FileType, type Handler, type ToolDeclaration, type ToolModule, type ToolResult, type ToolView } from './toolkit';

const declarations: ToolDeclaration[] = [
  {
    name: 'list_drive_folder',
    description:
      "What's in a folder of the lab's Google Drive (the \"Lab Drive\" in the portal): subfolders and files with type, size, owner, who last edited it, created and last-modified dates and a Drive link. Omit folder_id for the top-level lab folder. recursive lists everything underneath too, each with its folder path.",
    parameters: {
      type: 'object',
      properties: {
        folder_id: { type: 'string', description: 'A folder id from an earlier listing or search.' },
        recursive: { type: 'boolean', description: 'Include subfolders\' contents (up to 500 items).' },
      },
    },
  },
  {
    name: 'search_drive',
    description:
      "Find files and folders in the lab's Drive. query matches names and text (Google's full-text search covers Docs, PDFs and Office files); every filter is optional, and with no query it lists by the filters, newest first. Each result has its owner (the creator; for a \"Copy of\" file, whoever made the copy), last editor, created and modified dates, and folder path.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        type: { type: 'string', enum: DRIVE_KINDS, description: 'Only this kind of file.' },
        folder_id: { type: 'string', description: 'Only inside this folder (subfolders included).' },
        owner: { type: 'string', description: "The owner's email address." },
        created_after: { type: 'string', description: 'ISO date, e.g. 2026-10-01.' },
        modified_after: { type: 'string', description: 'ISO date.' },
        order_by: { type: 'string', enum: ['modified', 'created', 'name'], description: 'Default: relevance with a query, else most recently modified.' },
        limit: { type: 'integer', description: '1-100, default 25.' },
      },
    },
  },
  {
    name: 'get_drive_file_info',
    description:
      "Everything Drive records about one file or folder: owner (who created it, or copied it), who last edited it, created and modified dates, who it is shared with (when Drive allows listing), its earliest saved versions and, when the Drive Activity API is on, its history: created, copied from which original, renamed, moved, shared, deleted. Use this to answer who made a file, when, and whether it is a copy of something.",
    parameters: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] },
  },
  {
    name: 'get_drive_activity',
    description:
      "Recent activity across the lab Drive (or one folder or file): who created, copied, edited, renamed, moved, shared or deleted what, and when. Needs the Drive Activity API; if it is not enabled the result says so, and search_drive / get_drive_file_info still give each file's owner and dates.",
    parameters: {
      type: 'object',
      properties: {
        folder_id: { type: 'string', description: 'Activity under this folder (default: the whole lab folder).' },
        file_id: { type: 'string', description: 'Activity on this one file instead.' },
        since_days: { type: 'integer', description: 'Only the last N days (1-365).' },
        actions: { type: 'array', items: { type: 'string', enum: ACTIVITY_ACTIONS }, description: 'Only these kinds of activity, e.g. ["create"] for who made files.' },
        limit: { type: 'integer', description: '1-200, default 50.' },
      },
    },
  },
  {
    name: 'read_drive_file',
    description:
      'Read a file from the lab Drive: Google Docs (as Markdown), Sheets (first sheet as CSV), Slides (text), text and code files, PDFs and images (you see them directly). Word/Excel/PowerPoint uploads cannot be read. Long text is cut at max_chars; read a later part with offset.',
    parameters: {
      type: 'object',
      properties: {
        file_id: { type: 'string' },
        offset: { type: 'integer', description: 'Character to start from, for text (default 0).' },
        max_chars: { type: 'integer', description: '1000-150000, default 60000.' },
      },
      required: ['file_id'],
    },
  },
];

const who = (u: DriveUser | null) => (u ? (u.email && u.email !== u.name ? `${u.name} <${u.email}>` : u.name) : null);

const itemView = ({ id, name, mimeType, isFolder, size, createdTime, modifiedTime, owner, lastModifiedBy, shared, webViewLink }: DriveItem) => ({
  id,
  name,
  type: isFolder ? 'folder' : mimeType.replace('application/vnd.google-apps.', 'google-'),
  size,
  created: createdTime,
  modified: modifiedTime,
  owner: who(owner),
  last_modified_by: who(lastModifiedBy),
  shared,
  url: webViewLink,
});

const handlers: Record<string, Handler> = {
  list_drive_folder: async (args) => {
    const id = str(args.folder_id) ?? driveRootId();
    if (args.recursive === true) {
      const { path } = await listFolder(id);
      const { items, truncated } = await walkFolder(id);
      return {
        path: path.map((p) => p.name).join(' / '),
        folder_id: id,
        total: items.length,
        truncated,
        items: items.map((i) => ({ ...itemView(i), path: i.path })),
      };
    }
    const { path, items } = await listFolder(id);
    return { path: path.map((p) => p.name).join(' / '), folder_id: path.at(-1)?.id, total: items.length, items: items.slice(0, 300).map(itemView) };
  },

  search_drive: async (args) => {
    const query = str(args.query);
    const type = str(args.type) as DriveKind | undefined;
    const order = str(args.order_by) as 'modified' | 'created' | 'name' | undefined;
    if (type && !DRIVE_KINDS.includes(type)) return { error: `type must be one of ${DRIVE_KINDS.join(', ')}` };
    if (order && !['modified', 'created', 'name'].includes(order)) return { error: 'order_by must be modified, created or name' };
    const files = await searchDrive(query, clamp(args.limit, 25, 1, 100), {
      kind: type,
      folderId: str(args.folder_id),
      owner: str(args.owner),
      createdAfter: str(args.created_after),
      modifiedAfter: str(args.modified_after),
      orderBy: order,
    });
    return { query: query ?? null, total: files.length, items: files.map((f) => ({ ...itemView(f), path: f.path })) };
  },

  get_drive_file_info: async (args) => {
    const id = String(args.file_id);
    const d = await fileDetails(id);
    const activity = await driveActivity({ fileId: id, limit: 25 });
    return {
      ...itemView(d.item),
      path: d.path,
      description: d.item.description,
      trashed: d.trashed,
      in_shared_drive: d.inSharedDrive,
      shared_with: d.sharedWith ?? 'unknown: Drive only lists this for files the service account can edit',
      earliest_versions: d.revisions ? d.revisions.earliest.map((r) => ({ time: r.time, by: who(r.by) })) : 'not available for this file',
      ...(d.item.owner && d.item.name.startsWith('Copy of ')
        ? { note: `"Copy of" file: ${who(d.item.owner)} made the copy, and created is when they made it. Drive does not record the original except in activity history.` }
        : {}),
      history: activity.available ? { events: activity.events, truncated: activity.truncated } : { unavailable: activity.reason },
    };
  },

  get_drive_activity: async (args) => {
    const actions = (Array.isArray(args.actions) ? args.actions : []).filter((a): a is ActivityAction => ACTIVITY_ACTIONS.includes(a as ActivityAction));
    const result = await driveActivity({
      fileId: str(args.file_id),
      folderId: str(args.folder_id),
      sinceDays: args.since_days === undefined ? undefined : clamp(args.since_days, 30, 1, 365),
      actions,
      limit: clamp(args.limit, 50, 1, 200),
    });
    return result.available ? { total: result.events.length, truncated: result.truncated, events: result.events } : { total: 0, unavailable: result.reason };
  },

  read_drive_file: async (args) => {
    const file = await readFile(String(args.file_id));
    const { kind, ...meta } = file;
    const info = {
      id: meta.id,
      name: meta.name,
      mime_type: meta.mimeType,
      path: meta.path,
      created: meta.createdTime,
      modified: meta.modifiedTime,
      owner: who(meta.owner),
      last_modified_by: who(meta.lastModifiedBy),
      url: meta.webViewLink,
      size: meta.size,
      note: meta.note,
    };
    switch (file.kind) {
      case 'text': {
        const offset = clamp(args.offset, 0, 0, file.text.length);
        const text = file.text.slice(offset, offset + clamp(args.max_chars, 60_000, 1000, 150_000));
        return { ...info, kind, chars: file.text.length, offset, truncated: offset + text.length < file.text.length, text };
      }
      case 'pdf':
        return {
          ...info,
          kind,
          _content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.base64 }, title: file.name }],
        };
      case 'image':
        return {
          ...info,
          kind,
          _content: [{ type: 'image', source: { type: 'base64', media_type: file.mediaType as 'image/png', data: file.base64 } }],
        };
      default:
        return { ...info, kind, error: file.reason };
    }
  },
};

for (const name of Object.keys(handlers)) {
  const handler = handlers[name];
  handlers[name] = (args, ctx) => (driveEnabled ? handler(args, ctx) : { error: 'Google Drive is not set up' });
}

function summarize(name: string, r: ToolResult): string | undefined {
  switch (name) {
    case 'list_drive_folder':
      return `${String(r.path).split(' / ').at(-1)} · ${plural(Number(r.total), 'item')}${r.truncated ? ' (part)' : ''}`;
    case 'search_drive':
      return plural(Number(r.total), 'match', 'matches');
    case 'get_drive_file_info':
      return `${r.name} · ${r.owner ?? 'owner unknown'}`;
    case 'get_drive_activity':
      return r.unavailable ? 'Activity API off' : plural(Number(r.total), 'event');
    case 'read_drive_file':
      return r.kind === 'text' ? `${r.name} · ${Number(r.chars).toLocaleString()} characters${r.truncated ? ' (part)' : ''}` : `${r.name} · ${r.kind}`;
    default:
      return undefined;
  }
}

function fileType(type: string, name: string): FileType {
  if (type === 'folder') return 'folder';
  if (type === 'google-document' || /\.(docx?|md|txt)$/i.test(name)) return 'doc';
  if (type === 'google-spreadsheet' || /\.(xlsx?|csv)$/i.test(name)) return 'sheet';
  if (type === 'google-presentation' || /\.pptx?$/i.test(name)) return 'slides';
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('image/')) return 'image';
  return 'file';
}

type Item = ReturnType<typeof itemView> & { path?: string };
const fileRow = (i: Item, meta: string) => ({ name: i.name, type: fileType(i.type, i.name), meta, url: i.url ?? undefined });
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
/** "Ada Lovelace · created 2026-10-14 · edited 2026-10-19" */
const authorship = (i: Item) =>
  [i.owner?.replace(/ <.*>$/, ''), i.created ? `created ${day(i.created)}` : '', `edited ${day(i.modified)}`].filter(Boolean).join(' · ');

function view(name: string, r: ToolResult): ToolView | null | undefined {
  switch (name) {
    case 'list_drive_folder':
      return {
        kind: 'files',
        path: String(r.path),
        total: Number(r.total),
        items: list<Item>(r, 'items')
          .slice(0, VIEW_ROWS * 2)
          .map((i) => fileRow(i, [i.size !== null ? formatBytes(i.size) : '', authorship(i)].filter(Boolean).join(' · '))),
      };
    case 'search_drive':
      return {
        kind: 'files',
        path: r.query ? `“${r.query}”` : 'Filtered search',
        total: Number(r.total),
        items: list<Item>(r, 'items')
          .slice(0, VIEW_ROWS)
          .map((i) => fileRow(i, authorship(i))),
      };
    case 'get_drive_file_info':
      return {
        kind: 'doc',
        title: String(r.name),
        subtitle: [String(r.path).split(' / ').slice(0, -1).join(' / '), `owner ${String(r.owner ?? 'unknown')}`].filter(Boolean).join(' · '),
        excerpt: [`Created ${day(r.created as string | null)}`, `last edited ${day(r.modified as string | null)}${r.last_modified_by ? ` by ${String(r.last_modified_by).replace(/ <.*>$/, '')}` : ''}`, r.shared ? 'shared' : 'not shared'].join(' · '),
        url: (r.url as string | null) ?? undefined,
      };
    case 'get_drive_activity': {
      if (r.unavailable) return { kind: 'error', message: String(r.unavailable) };
      type Event = { time: string; detail: string; actors: string[]; file: { title: string } | null };
      return {
        kind: 'rows',
        total: Number(r.total),
        items: list<Event>(r, 'events')
          .slice(0, VIEW_ROWS)
          .map((e, n) => ({ key: String(n), title: `${e.file?.title ?? 'A file'} · ${e.detail}`, meta: `${e.actors.map((a) => a.replace(/ <.*>$/, '')).join(', ')} · ${day(e.time)}` })),
      };
    }
    case 'read_drive_file':
      return {
        kind: 'doc',
        title: String(r.name),
        subtitle: [String(r.path).split(' / ').slice(0, -1).join(' / '), r.kind === 'text' ? `${Number(r.chars).toLocaleString()} characters` : String(r.kind).toUpperCase()].filter(Boolean).join(' · '),
        excerpt: r.kind === 'text' ? excerpt(String(r.text ?? ''), 400) : r.kind === 'pdf' || r.kind === 'image' ? 'Read directly by Claude.' : String(r.error ?? ''),
        url: (r.url as string | null) ?? undefined,
      };
    default:
      return undefined;
  }
}

export const driveTools: ToolModule = { declarations, handlers, summarize, view };
