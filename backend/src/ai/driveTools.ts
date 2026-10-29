// The assistant's Lab Drive tools: browse, search and read the lab's Google
// Drive folder, read-only, as the site's service account. Only files inside
// the lab folder are reachable (google/drive.ts checks every id).
import { driveEnabled, driveRootId, listFolder, readFile, searchDrive, type DriveItem } from '../google/drive';
import { clamp, excerpt, formatBytes, list, plural, str, VIEW_ROWS, type FileType, type Handler, type ToolDeclaration, type ToolModule, type ToolResult, type ToolView } from './toolkit';

const declarations: ToolDeclaration[] = [
  {
    name: 'list_drive_folder',
    description:
      "What's in a folder of the lab's Google Drive (the \"Lab Drive\" in the portal): subfolders and files with type, size, last modified and a Drive link. Omit folder_id for the top-level lab folder.",
    parameters: { type: 'object', properties: { folder_id: { type: 'string', description: 'A folder id from an earlier listing or search.' } } },
  },
  {
    name: 'search_drive',
    description: "Find files and folders in the lab's Drive whose name or text contains the query (Google's full-text search covers Docs, PDFs and Office files). Returns ids to read, with their folder path.",
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
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

const itemView = ({ id, name, mimeType, isFolder, size, modifiedTime, webViewLink }: DriveItem) => ({
  id,
  name,
  type: isFolder ? 'folder' : mimeType.replace('application/vnd.google-apps.', 'google-'),
  size,
  modified: modifiedTime,
  url: webViewLink,
});

const handlers: Record<string, Handler> = {
  list_drive_folder: async (args) => {
    const { path, items } = await listFolder(str(args.folder_id) ?? driveRootId());
    return { path: path.map((p) => p.name).join(' / '), folder_id: path.at(-1)?.id, total: items.length, items: items.slice(0, 300).map(itemView) };
  },

  search_drive: async (args) => {
    const query = str(args.query);
    if (!query) return { error: 'A query is required' };
    const files = await searchDrive(query);
    return { query, total: files.length, items: files.map((f) => ({ ...itemView(f), path: f.path })) };
  },

  read_drive_file: async (args) => {
    const file = await readFile(String(args.file_id));
    const { kind, ...meta } = file;
    const info = { id: meta.id, name: meta.name, mime_type: meta.mimeType, path: meta.path, modified: meta.modifiedTime, url: meta.webViewLink, size: meta.size, note: meta.note };
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
      return `${String(r.path).split(' / ').at(-1)} · ${plural(Number(r.total), 'item')}`;
    case 'search_drive':
      return plural(Number(r.total), 'match', 'matches');
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
const modified = (i: Item) => i.modified.slice(0, 10);

function view(name: string, r: ToolResult): ToolView | null | undefined {
  switch (name) {
    case 'list_drive_folder':
      return {
        kind: 'files',
        path: String(r.path),
        total: Number(r.total),
        items: list<Item>(r, 'items')
          .slice(0, VIEW_ROWS * 2)
          .map((i) => fileRow(i, [i.size !== null ? formatBytes(i.size) : '', modified(i)].filter(Boolean).join(' · '))),
      };
    case 'search_drive':
      return { kind: 'files', path: `“${r.query}”`, total: Number(r.total), items: list<Item>(r, 'items').slice(0, VIEW_ROWS).map((i) => fileRow(i, i.path ? i.path.split(' / ').slice(1, -1).join(' / ') : modified(i))) };
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
