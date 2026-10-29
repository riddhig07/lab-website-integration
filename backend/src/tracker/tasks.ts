// Tasks, their subtasks (a weekly checklist, each item optionally handed to
// someone else) and progress updates. Ported from SmartBrowse's story tracker.
import { db } from '../db';
import { canonicalLogin } from './people';
import { joinSprint, resolveSprintKey, SprintError } from './sprints';

export const TASK_TYPES = ['research', 'experiment', 'code', 'bug', 'writing', 'admin'] as const;
// Non-code work: never linked to commits by title (an explicit T-<id> in a
// commit message still links).
export const NON_CODE_TYPES: ReadonlySet<string> = new Set(['writing', 'admin']);
export const PRIORITIES = ['none', 'P0', 'P1', 'P2', 'P3', 'P4'] as const;
export const STATUSES = ['todo', 'in-progress', 'blocked', 'done'] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];

const MAX_SUBTASKS = 50;
// Oldest updates fall off past this so a long-running task stays small.
const MAX_UPDATES = 200;

export class TrackerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Shapes

export interface Subtask {
  id: number;
  title: string;
  /** null: the task's assignee owns it */
  assignee: string | null;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  created_at: string;
}

export interface TaskUpdate {
  id: number;
  body: string;
  author: string;
  subtask_id: number | null;
  created_at: string;
}

export interface TaskLink {
  id: number;
  repo: string;
  kind: 'issue' | 'pr';
  number: number;
  title: string;
  state: string;
  merged: boolean;
  url: string;
}

export interface LinkedCommit {
  repo: string;
  sha: string;
  message: string;
  author_login: string | null;
  author_name: string | null;
  authored_at: string;
  url: string;
  merged: boolean;
}

export interface Task {
  id: number;
  ref: string;
  title: string;
  description: string | null;
  assignee: string | null;
  task_type: TaskType;
  priority: Priority;
  status: Status;
  scope: number | null;
  pm_note: string | null;
  sprint_key: string | null;
  sprint_keys: string[];
  position: number;
  archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  subtasks: Subtask[];
  subtask_done_count: number;
  /** Newest first. */
  updates: TaskUpdate[];
  links: TaskLink[];
  /** Newest first. */
  commits: LinkedCommit[];
  commit_authors: { login: string | null; name: string; count: number; merged: number; unmerged: number }[];
}

interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  assignee: string | null;
  task_type: TaskType;
  priority: Priority;
  status: Status;
  scope: number | null;
  pm_note: string | null;
  sprint_key: string | null;
  position: number;
  archived: number;
  archived_at: string | null;
  archived_by: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const taskRef = (id: number) => `T-${id}`;
const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Reading

function groupBy<T extends { task_id: number }>(rows: T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const r of rows) {
    const list = out.get(r.task_id);
    if (list) list.push(r);
    else out.set(r.task_id, [r]);
  }
  return out;
}

/** Full task DTOs for these rows, children loaded in one query per table. */
function hydrate(rows: TaskRow[]): Task[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const inList = `(${ids.map(() => '?').join(',')})`;
  const subtasks = groupBy(
    db.prepare(`SELECT * FROM tracker_subtasks WHERE task_id IN ${inList} ORDER BY id`).all(...ids) as (Omit<Subtask, 'done'> & {
      task_id: number;
      done: number;
    })[],
  );
  const updates = groupBy(
    db.prepare(`SELECT * FROM tracker_updates WHERE task_id IN ${inList} ORDER BY created_at DESC, id DESC`).all(...ids) as unknown as (TaskUpdate & {
      task_id: number;
    })[],
  );
  const links = groupBy(
    db.prepare(`SELECT * FROM tracker_links WHERE task_id IN ${inList} ORDER BY id`).all(...ids) as (Omit<TaskLink, 'merged'> & {
      task_id: number;
      merged: number;
    })[],
  );
  const commits = groupBy(
    db
      .prepare(
        `SELECT tc.task_id, c.repo, c.sha, c.message, c.author_login, c.author_name, c.authored_at, c.url, c.on_default
           FROM tracker_commits tc JOIN gh_commits c ON c.repo = tc.repo AND c.sha = tc.sha
          WHERE tc.task_id IN ${inList} ORDER BY c.authored_at DESC`,
      )
      .all(...ids) as (Omit<LinkedCommit, 'merged'> & { task_id: number; on_default: number })[],
  );
  const sprints = groupBy(
    db.prepare(`SELECT task_id, sprint_key FROM tracker_task_sprints WHERE task_id IN ${inList} ORDER BY sprint_key`).all(...ids) as {
      task_id: number;
      sprint_key: string;
    }[],
  );

  return rows.map((r) => {
    const subs = (subtasks.get(r.id) ?? []).map(({ task_id: _, done, ...s }) => ({ ...s, done: Boolean(done) }));
    const linked = (commits.get(r.id) ?? []).map(({ task_id: _, on_default, ...c }) => ({ ...c, merged: Boolean(on_default) }));
    const authors = new Map<string, Task['commit_authors'][number]>();
    for (const c of linked) {
      const key = (c.author_login ?? c.author_name ?? '').toLowerCase();
      if (!key) continue;
      const slot = authors.get(key) ?? { login: c.author_login, name: c.author_name ?? c.author_login ?? key, count: 0, merged: 0, unmerged: 0 };
      slot.count++;
      if (c.merged) slot.merged++;
      else slot.unmerged++;
      authors.set(key, slot);
    }
    return {
      ...r,
      ref: taskRef(r.id),
      archived: Boolean(r.archived),
      sprint_keys: (sprints.get(r.id) ?? []).map((s) => s.sprint_key),
      subtasks: subs,
      subtask_done_count: subs.filter((s) => s.done).length,
      updates: (updates.get(r.id) ?? []).map(({ task_id: _, ...u }) => u),
      links: (links.get(r.id) ?? []).map(({ task_id: _, merged, ...l }) => ({ ...l, merged: Boolean(merged) })),
      commits: linked,
      commit_authors: [...authors.values()].sort((a, b) => b.count - a.count),
    };
  });
}

export function getTask(id: number): Task | null {
  const row = db.prepare('SELECT * FROM tracker_tasks WHERE id = ?').get(id) as TaskRow | undefined;
  return row ? hydrate([row])[0] : null;
}

export function requireTask(id: number): Task {
  const task = Number.isInteger(id) ? getTask(id) : null;
  if (!task) throw new TrackerError(404, 'Task not found');
  return task;
}

export interface TaskFilters {
  /** true: only archived tasks; false (default): everything else */
  archived?: boolean;
  /** a sprint key, 'current', 'previous', or 'backlog' (no sprint) */
  sprint?: string;
  /** Tasks they own plus tasks where they hold a subtask. */
  assignee?: string;
  status?: string;
  task_type?: string;
  priority?: string;
  scope?: number;
  q?: string;
}

export function listTasks(filters: TaskFilters = {}): Task[] {
  const where = ['t.archived = ?'];
  const params: (string | number)[] = [filters.archived ? 1 : 0];
  if (filters.sprint === 'backlog') {
    where.push('t.sprint_key IS NULL');
  } else if (filters.sprint) {
    where.push('t.id IN (SELECT task_id FROM tracker_task_sprints WHERE sprint_key = ?)');
    params.push(sprintParam(filters.sprint)!);
  }
  if (filters.assignee) {
    where.push('(t.assignee = ? OR t.id IN (SELECT task_id FROM tracker_subtasks WHERE assignee = ?))');
    params.push(filters.assignee, filters.assignee);
  }
  for (const key of ['status', 'task_type', 'priority'] as const) {
    if (filters[key]) {
      where.push(`t.${key} = ?`);
      params.push(filters[key]!);
    }
  }
  if (filters.scope) {
    where.push('t.scope = ?');
    params.push(filters.scope);
  }
  if (filters.q) {
    where.push(`(t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')`);
    const like = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    params.push(like, like);
  }
  const order = filters.archived ? 't.archived_at DESC' : 't.position, t.created_at DESC';
  const rows = db.prepare(`SELECT t.* FROM tracker_tasks t WHERE ${where.join(' AND ')} ORDER BY ${order}`).all(...params) as unknown as TaskRow[];
  return hydrate(rows);
}

function sprintParam(value: unknown): string | null {
  try {
    return resolveSprintKey(value);
  } catch (err) {
    if (err instanceof SprintError) throw new TrackerError(400, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Validation

export interface TaskFields {
  title: string;
  description: string | null;
  assignee: string | null;
  task_type: TaskType;
  priority: Priority;
  status: Status;
  scope: number | null;
  pm_note: string | null;
  /** Resolved sprint key; null = backlog. */
  sprint_key: string | null;
}

export interface SubtaskInput {
  title: string;
  assignee: string | null;
}

/** A team member's login, or null; throws for anyone else. */
export function assigneeParam(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const login = canonicalLogin(String(value).trim().replace(/^@/, ''));
  if (!login) throw new TrackerError(400, `${String(value)} is not on the team`);
  return login;
}

function text(value: unknown, label: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s.length > max) throw new TrackerError(400, `${label} is too long (max ${max} characters)`);
  return s || null;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (!options.includes(value as T)) throw new TrackerError(400, `${label} must be one of: ${options.join(', ')}`);
  return value as T;
}

/**
 * Validates task fields from a request body. With `partial`, only fields
 * present in the body are returned (a PATCH); otherwise defaults fill in.
 */
export function parseTaskFields(body: unknown, partial: boolean): Partial<TaskFields> {
  if (!body || typeof body !== 'object') throw new TrackerError(400, 'Expected a JSON object');
  const b = body as Record<string, unknown>;
  const has = (k: string) => k in b && b[k] !== undefined;
  const out: Partial<TaskFields> = {};

  if (has('title') || !partial) {
    const title = text(b.title, 'Title', 300);
    if (!title) throw new TrackerError(400, 'Title is required');
    out.title = title;
  }
  if (has('description')) out.description = text(b.description, 'Description', 20_000);
  if (has('assignee')) out.assignee = assigneeParam(b.assignee);
  if (has('task_type') || !partial) out.task_type = has('task_type') ? oneOf(b.task_type, TASK_TYPES, 'Type') : 'research';
  if (has('priority') || !partial) out.priority = has('priority') ? oneOf(b.priority, PRIORITIES, 'Priority') : 'none';
  if (has('status') || !partial) out.status = has('status') ? oneOf(b.status, STATUSES, 'Status') : 'todo';
  if (has('scope')) {
    if (b.scope === null || b.scope === '') out.scope = null;
    else {
      const n = Number(b.scope);
      if (!Number.isInteger(n) || n < 1 || n > 5) throw new TrackerError(400, 'Scope must be 1-5');
      out.scope = n;
    }
  }
  if (has('pm_note')) out.pm_note = text(b.pm_note, 'PM note', 500);
  if (has('sprint_key')) out.sprint_key = sprintParam(b.sprint_key);
  return out;
}

export function parseSubtasks(value: unknown): SubtaskInput[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TrackerError(400, 'subtasks must be a list');
  if (value.length > MAX_SUBTASKS) throw new TrackerError(400, `At most ${MAX_SUBTASKS} subtasks`);
  return value
    .map((s) =>
      typeof s === 'string'
        ? { title: s.trim().slice(0, 300), assignee: null }
        : { title: String((s as SubtaskInput)?.title ?? '').trim().slice(0, 300), assignee: assigneeParam((s as SubtaskInput)?.assignee) },
    )
    .filter((s) => s.title);
}

// ---------------------------------------------------------------------------
// Writing

/** New cards go to the top of their column. */
function topPosition(): number {
  const { p } = db.prepare('SELECT MIN(position) AS p FROM tracker_tasks').get() as { p: number | null };
  return (p ?? 0) - 1;
}

export function createTask(fields: Partial<TaskFields> & { title: string }, subtasks: SubtaskInput[], actor: string): Task {
  const at = now();
  const status = fields.status ?? 'todo';
  const result = db
    .prepare(
      `INSERT INTO tracker_tasks (title, description, assignee, task_type, priority, status, scope, pm_note,
                                  position, completed_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      fields.title,
      fields.description ?? null,
      fields.assignee ?? null,
      fields.task_type ?? 'research',
      fields.priority ?? 'none',
      status,
      fields.scope ?? null,
      fields.pm_note ?? null,
      topPosition(),
      status === 'done' ? at : null,
      actor,
      at,
      at,
    );
  const id = Number(result.lastInsertRowid);
  if (fields.sprint_key) joinSprint(id, fields.sprint_key);
  const insert = db.prepare('INSERT INTO tracker_subtasks (task_id, title, assignee, created_at) VALUES (?, ?, ?, ?)');
  for (const s of subtasks) insert.run(id, s.title, s.assignee, at);
  return getTask(id)!;
}

/** Applies a PATCH. Returns the task and whether its title changed (commit links depend on it). */
export function patchTask(id: number, fields: Partial<TaskFields>): { task: Task; titleChanged: boolean } {
  const current = requireTask(id);
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const set = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  for (const key of ['title', 'description', 'assignee', 'task_type', 'priority', 'scope', 'pm_note'] as const) {
    if (key in fields) set(key, fields[key] ?? null);
  }
  if (fields.status !== undefined && fields.status !== current.status) {
    set('status', fields.status);
    if (fields.status === 'done') {
      // Sprint summaries count a task as finished in the sprint where this lands.
      set('completed_at', now());
    } else {
      // Only done work stays archived; reopening a task puts it back on the board.
      set('completed_at', null);
      set('archived', 0);
      set('archived_at', null);
      set('archived_by', null);
    }
  }
  if ('sprint_key' in fields) {
    if (fields.sprint_key) joinSprint(id, fields.sprint_key);
    else set('sprint_key', null);
  }
  if (sets.length > 0 || 'sprint_key' in fields) {
    set('updated_at', now());
    db.prepare(`UPDATE tracker_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  }
  return { task: getTask(id)!, titleChanged: fields.title !== undefined && fields.title !== current.title };
}

/** A drag on the board: new status, owner and/or position in the column. */
export function moveTask(id: number, body: unknown): Task {
  const b = (body ?? {}) as Record<string, unknown>;
  const fields: Partial<TaskFields> = {};
  if ('status' in b) fields.status = oneOf(b.status, STATUSES, 'Status');
  if ('assignee' in b) fields.assignee = assigneeParam(b.assignee);
  if ('position' in b) {
    const position = Number(b.position);
    if (!Number.isFinite(position)) throw new TrackerError(400, 'position must be a number');
    db.prepare('UPDATE tracker_tasks SET position = ? WHERE id = ?').run(position, id);
  }
  return patchTask(id, fields).task;
}

export function deleteTask(id: number): void {
  if (db.prepare('DELETE FROM tracker_tasks WHERE id = ?').run(id).changes === 0) throw new TrackerError(404, 'Task not found');
}

/** Archives done tasks (others are skipped) or restores archived ones. */
export function setArchived(ids: number[], archived: boolean, actor: string): { updated: number; skipped: number } {
  // Archiving never touches updated_at: the recap reads it as "when the task was finished".
  const stmt = archived
    ? db.prepare(`UPDATE tracker_tasks SET archived = 1, archived_at = ?, archived_by = ? WHERE id = ? AND status = 'done' AND archived = 0`)
    : db.prepare(`UPDATE tracker_tasks SET archived = 0, archived_at = NULL, archived_by = NULL WHERE id = ? AND archived = 1`);
  let updated = 0;
  const at = now();
  for (const id of ids) updated += Number((archived ? stmt.run(at, actor, id) : stmt.run(id)).changes);
  return { updated, skipped: ids.length - updated };
}

export function parseIds(value: unknown, max = 500): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) throw new TrackerError(400, 'task_ids must be a non-empty list');
  const ids = value.map(Number);
  if (!ids.every((n) => Number.isInteger(n) && n > 0)) throw new TrackerError(400, 'Invalid task id');
  return ids;
}

const touch = (id: number) => db.prepare('UPDATE tracker_tasks SET updated_at = ? WHERE id = ?').run(now(), id);

export function addSubtask(taskId: number, input: SubtaskInput): Task {
  const task = requireTask(taskId);
  if (!input.title) throw new TrackerError(400, 'Title is required');
  if (task.subtasks.length >= MAX_SUBTASKS) throw new TrackerError(400, `At most ${MAX_SUBTASKS} subtasks`);
  db.prepare('INSERT INTO tracker_subtasks (task_id, title, assignee, created_at) VALUES (?, ?, ?, ?)').run(taskId, input.title, input.assignee, now());
  touch(taskId);
  return getTask(taskId)!;
}

export function patchSubtask(taskId: number, subtaskId: number, body: unknown, actor: string): Task {
  const b = (body ?? {}) as Record<string, unknown>;
  const row = db.prepare('SELECT id FROM tracker_subtasks WHERE id = ? AND task_id = ?').get(subtaskId, taskId);
  if (!row) throw new TrackerError(404, 'Subtask not found');
  if ('title' in b) {
    const title = text(b.title, 'Title', 300);
    if (!title) throw new TrackerError(400, 'Title is required');
    db.prepare('UPDATE tracker_subtasks SET title = ? WHERE id = ?').run(title, subtaskId);
  }
  if ('done' in b) {
    const done = Boolean(b.done);
    db.prepare('UPDATE tracker_subtasks SET done = ?, done_at = ?, done_by = ? WHERE id = ?').run(
      done ? 1 : 0,
      done ? now() : null,
      done ? actor : null,
      subtaskId,
    );
  }
  // null hands it back to the task's owner.
  if ('assignee' in b) db.prepare('UPDATE tracker_subtasks SET assignee = ? WHERE id = ?').run(assigneeParam(b.assignee), subtaskId);
  touch(taskId);
  return getTask(taskId)!;
}

export function deleteSubtask(taskId: number, subtaskId: number): Task {
  if (db.prepare('DELETE FROM tracker_subtasks WHERE id = ? AND task_id = ?').run(subtaskId, taskId).changes === 0) {
    throw new TrackerError(404, 'Subtask not found');
  }
  touch(taskId);
  return getTask(taskId)!;
}

/** A progress note on a task, optionally about one of its subtasks. */
export function postUpdate(taskId: number, body: unknown, actor: string): Task {
  requireTask(taskId);
  const b = (body ?? {}) as Record<string, unknown>;
  const textBody = text(b.body, 'Update', 2000);
  if (!textBody) throw new TrackerError(400, 'Write an update first');
  let subtaskId: number | null = null;
  if (b.subtask_id !== undefined && b.subtask_id !== null && b.subtask_id !== '') {
    subtaskId = Number(b.subtask_id);
    if (!db.prepare('SELECT 1 FROM tracker_subtasks WHERE id = ? AND task_id = ?').get(subtaskId, taskId)) {
      throw new TrackerError(404, 'Subtask not found');
    }
  }
  db.prepare('INSERT INTO tracker_updates (task_id, subtask_id, body, author, created_at) VALUES (?, ?, ?, ?, ?)').run(
    taskId,
    subtaskId,
    textBody,
    actor,
    now(),
  );
  db.prepare(
    `DELETE FROM tracker_updates WHERE task_id = ? AND id NOT IN
       (SELECT id FROM tracker_updates WHERE task_id = ? ORDER BY created_at DESC, id DESC LIMIT ${MAX_UPDATES})`,
  ).run(taskId, taskId);
  touch(taskId);
  return getTask(taskId)!;
}

/** Authors can take back their own updates; nobody else's. */
export function deleteUpdate(taskId: number, updateId: number, actor: string): Task {
  const row = db.prepare('SELECT author FROM tracker_updates WHERE id = ? AND task_id = ?').get(updateId, taskId) as
    | { author: string }
    | undefined;
  if (!row) throw new TrackerError(404, 'Update not found');
  if (row.author.toLowerCase() !== actor.toLowerCase()) throw new TrackerError(403, 'Only the author can delete an update');
  db.prepare('DELETE FROM tracker_updates WHERE id = ?').run(updateId);
  return getTask(taskId)!;
}
