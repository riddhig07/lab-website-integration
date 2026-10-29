// The assistant's site-content tools: the people, publications, news and lab
// resources members manage in the portal, validated by the same definitions
// as the portal's forms (resources.ts, routes/crud.ts).
import { db, fromRow, type Row } from '../db';
import { CONTENT_ORDER_BY, RESOURCE_DEFS, type ResourceKey } from '../resources';
import { parseInput } from '../routes/crud';
import { excerpt, list, plural, str, VIEW_ROWS, type Args, type Handler, type ToolDeclaration, type ToolModule, type ToolResult, type ToolView } from './toolkit';

const KEYS = Object.keys(RESOURCE_DEFS) as ResourceKey[];

/** The fields of every content type, so the model knows what it can set. */
const FIELD_GUIDE = KEYS.map((key) => {
  const def = RESOURCE_DEFS[key];
  const fields = def.fields.map((f) => {
    const opts = 'options' in f && f.options ? ` (${f.options.join('|')})` : '';
    return `${f.name}${f.required ? '*' : ''}: ${f.type}${opts}`;
  });
  return `${key}${def.public ? ' [public site]' : ' [members only]'}: ${fields.join(', ')}`;
}).join('\n');

const TYPE = { type: 'string', enum: KEYS, description: 'people, publications and news appear on the public website; resources are members-only links.' };

const declarations: ToolDeclaration[] = [
  {
    name: 'list_content',
    description: `The portal's site content of one type, with every field. Fields (* required):\n${FIELD_GUIDE}`,
    parameters: { type: 'object', properties: { type: TYPE, query: { type: 'string', description: 'Only rows containing this text.' } }, required: ['type'] },
  },
  {
    name: 'create_content',
    description: 'Add a person, publication, news item or lab resource. people, publications and news go live on the public website (unless is_public is false): only when the member asks, and show them what you added.',
    parameters: { type: 'object', properties: { type: TYPE, fields: { type: 'object', description: 'Field values, see list_content.' } }, required: ['type', 'fields'] },
  },
  {
    name: 'update_content',
    description: 'Change fields on existing site content. Only pass what changes. Public types change the public website.',
    parameters: { type: 'object', properties: { type: TYPE, id: { type: 'integer' }, fields: { type: 'object' } }, required: ['type', 'id', 'fields'] },
  },
  {
    name: 'delete_content',
    description: 'Delete site content (admins only). Destructive: only after the member has clearly confirmed.',
    parameters: { type: 'object', properties: { type: TYPE, id: { type: 'integer' } }, required: ['type', 'id'] },
  },
];

function contentType(args: Args): ResourceKey {
  const key = String(args.type) as ResourceKey;
  if (!KEYS.includes(key)) throw new Error(`type must be one of ${KEYS.join(', ')}`);
  return key;
}

const getRow = (key: ResourceKey, id: number) => {
  const row = db.prepare(`SELECT * FROM ${key} WHERE id = ?`).get(id) as Row | undefined;
  return row ? fromRow(RESOURCE_DEFS[key], row) : null;
};

const fieldsOf = (args: Args) => (args.fields && typeof args.fields === 'object' && !Array.isArray(args.fields) ? (args.fields as Args) : {});

const handlers: Record<string, Handler> = {
  list_content: (args) => {
    const key = contentType(args);
    const rows = (db.prepare(`SELECT * FROM ${key} ORDER BY ${CONTENT_ORDER_BY[key]}`).all() as Row[]).map((r) => fromRow(RESOURCE_DEFS[key], r));
    const q = str(args.query)?.toLowerCase();
    const items = q ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : rows;
    return { type: key, total: items.length, items: items.slice(0, 200) };
  },

  create_content: (args, ctx) => {
    const key = contentType(args);
    const def = RESOURCE_DEFS[key];
    // Unset fields take the form's defaults, as in the portal.
    const input: Args = Object.fromEntries(def.fields.map((f) => [f.name, 'default' in f ? f.default : undefined]));
    const parsed = parseInput(def, { ...input, ...fieldsOf(args) });
    if ('error' in parsed) return { error: parsed.error };
    const columns = def.fields.map((f) => f.name);
    const result = db.prepare(`INSERT INTO ${key} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...parsed.values);
    const row = getRow(key, Number(result.lastInsertRowid));
    ctx.actions.push({ op: 'content', detail: `added ${def.singular.toLowerCase()}` });
    return { type: key, created: row };
  },

  update_content: (args, ctx) => {
    const key = contentType(args);
    const def = RESOURCE_DEFS[key];
    const current = getRow(key, Number(args.id));
    if (!current) return { error: `${def.singular} ${args.id} not found` };
    const parsed = parseInput(def, { ...current, ...fieldsOf(args) });
    if ('error' in parsed) return { error: parsed.error };
    const columns = def.fields.map((f) => f.name);
    db.prepare(`UPDATE ${key} SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...parsed.values, Number(args.id));
    ctx.actions.push({ op: 'content', detail: `updated ${def.singular.toLowerCase()}` });
    return { type: key, updated: Object.keys(fieldsOf(args)), item: getRow(key, Number(args.id)) };
  },

  delete_content: (args, ctx) => {
    if (ctx.user.role !== 'admin') return { error: 'Only lab admins can delete site content' };
    const key = contentType(args);
    const current = getRow(key, Number(args.id));
    if (!current) return { error: `${RESOURCE_DEFS[key].singular} ${args.id} not found` };
    db.prepare(`DELETE FROM ${key} WHERE id = ?`).run(Number(args.id));
    ctx.actions.push({ op: 'content', detail: `deleted ${RESOURCE_DEFS[key].singular.toLowerCase()}` });
    return { type: key, deleted: current };
  },
};

/** A row's name for display: its title, or a person's name. */
const label = (r: Row) => String(r.title ?? r.name ?? `#${r.id}`);

function meta(key: ResourceKey, r: Row): string {
  switch (key) {
    case 'people':
      return [r.title, r.category, r.is_public === false ? 'hidden' : ''].filter(Boolean).join(' · ');
    case 'publications':
      return [r.year, r.venue, r.featured ? 'featured' : ''].filter(Boolean).join(' · ');
    case 'news':
      return [r.published_at, r.is_public === false ? 'hidden' : ''].filter(Boolean).join(' · ');
    default:
      return [r.category, r.url].filter(Boolean).join(' · ');
  }
}

const NOUNS: Record<ResourceKey, [string, string]> = {
  people: ['person', 'people'],
  publications: ['publication', 'publications'],
  news: ['news item', 'news items'],
  resources: ['lab resource', 'lab resources'],
};

function summarize(name: string, r: ToolResult): string | undefined {
  const key = r.type as ResourceKey;
  switch (name) {
    case 'list_content':
      return plural(Number(r.total), ...NOUNS[key]);
    case 'create_content':
      return `added "${label(r.created as Row)}"`;
    case 'update_content':
      return `updated ${(r.updated as string[]).join(', ')}`;
    case 'delete_content':
      return `deleted "${label(r.deleted as Row)}"`;
    default:
      return undefined;
  }
}

function view(name: string, r: ToolResult): ToolView | null | undefined {
  const key = r.type as ResourceKey;
  const row = (x: Row) => ({ key: `#${x.id}`, title: label(x), meta: meta(key, x), url: typeof x.url === 'string' ? x.url : undefined });
  switch (name) {
    case 'list_content':
      return { kind: 'rows', total: Number(r.total), items: list<Row>(r, 'items').slice(0, VIEW_ROWS).map(row) };
    case 'create_content':
    case 'update_content':
    case 'delete_content': {
      const x = (r.created ?? r.item ?? r.deleted) as Row;
      const body = String(x.bio ?? x.body ?? x.description ?? x.authors ?? '');
      return { kind: 'doc', title: label(x), subtitle: `${RESOURCE_DEFS[key].singular} #${x.id} · ${meta(key, x)}`, excerpt: excerpt(body, 300), badge: name === 'delete_content' ? 'deleted' : undefined };
    }
    default:
      return undefined;
  }
}

export const contentTools: ToolModule = { declarations, handlers, summarize, view };
