// Shared pieces of the assistant's tools. Each tool module (tracker, GitHub,
// Drive, site content) exports a ToolModule; tools.ts puts them together.
import type Anthropic from '@anthropic-ai/sdk';
import type { User } from '../types';

export type Args = Record<string, unknown>;

export interface ToolContext {
  user: User;
  /** Mutations made this turn, streamed to the portal so it can refresh. */
  actions: { op: string; task_id?: number; title?: string; detail?: string }[];
}

/**
 * A tool's result: JSON for the model. `_content` adds blocks beyond JSON
 * (a PDF or image read from Drive); the portal never sees them.
 */
export type ToolResult = Record<string, unknown> & { _content?: Exclude<Anthropic.ToolResultBlockParam['content'], string> };

export type Handler = (args: Args, ctx: ToolContext) => unknown;

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/**
 * What the portal draws for a tool call: a compact, typed slice of the result
 * (the model sees the full result; the browser only needs enough to show it).
 */
export type ToolView =
  | { kind: 'tasks'; total: number; items: { id: number; ref: string; title: string; status: string; priority: string; assignee: string | null }[] }
  | { kind: 'people'; items: { login: string; name: string; role: string }[] }
  | { kind: 'bars'; unit: string; items: { label: string; value: number; secondary: number }[]; legend: [string, string] }
  | { kind: 'columns'; unit: string; items: { label: string; value: number }[] }
  | { kind: 'sprint'; label: string; committed: number; completed: number; pct: number; in_progress: number; blocked: number; todo: number }
  | { kind: 'rows'; total: number; items: { key: string; title: string; meta: string; state?: string; url?: string }[] }
  | { kind: 'files'; path: string; total: number; items: { name: string; type: FileType; meta: string; url?: string }[] }
  | { kind: 'doc'; title: string; subtitle: string; excerpt: string; url?: string; badge?: string }
  | { kind: 'commit'; sha: string; message: string; additions: number; deletions: number; files: { name: string; additions: number; deletions: number }[] }
  | { kind: 'error'; message: string };

export type FileType = 'folder' | 'doc' | 'sheet' | 'slides' | 'pdf' | 'image' | 'code' | 'file';

export interface ToolModule {
  declarations: ToolDeclaration[];
  handlers: Record<string, Handler>;
  /** One short line per call, shown on its card. */
  summarize(name: string, result: ToolResult): string | undefined;
  view(name: string, result: ToolResult): ToolView | null | undefined;
}

export const clamp = (v: unknown, def: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def;
};

export const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export const list = <T>(r: Record<string, unknown>, key: string) => (Array.isArray(r[key]) ? (r[key] as T[]) : []);

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** Rows shown in a card; the rest is "+N more". */
export const VIEW_ROWS = 8;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** The first `n` characters, cut at a word where possible. */
export function excerpt(text: string, n = 600): string {
  const flat = text.replace(/\r/g, '').trim();
  if (flat.length <= n) return flat;
  const cut = flat.slice(0, n);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 40))}…`;
}
