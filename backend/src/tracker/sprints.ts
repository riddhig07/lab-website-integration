// Weekly sprints for the task tracker, the single source of sprint dates and
// summaries for the routes, the assistant and the Slack posts.
//
// A sprint runs Monday 12:30 -> the next Monday 12:30 in TRACKER_TIMEZONE,
// so it ends exactly when the Monday Slack recap posts. Sprints are created
// lazily: ensureCurrentSprint() closes any sprint whose time is up (freezing
// its summary) and inserts the one covering `now`, so no scheduler is needed
// for correctness.
//
// Task fields owned by this module:
//   sprint_key             the sprint the task is in now (NULL = backlog)
//   tracker_task_sprints   every sprint the task was ever in; summaries read
//                          this, so moving a task to a later sprint never
//                          rewrites an earlier sprint's history
//   completed_at           when the task last became done
import { db } from '../db';
import { memberNames } from './people';
import { addDays, formatShortDate, isoDate, localDate, zonedParts, zonedToUtc } from './time';

const SPRINT_DAYS = 7;
const BOUNDARY_WEEKDAY = 1; // Monday
const BOUNDARY_HOUR = 12;
const BOUNDARY_MINUTE = 30;
const MAX_LISTED = 100;

export class SprintError extends Error {}

interface SprintRow {
  key: string;
  number: number;
  start_at: string;
  end_at: string;
  status: 'active' | 'closed';
  closed_at: string | null;
  summary_json: string | null;
}

export interface SprintInfo {
  key: string;
  number: number;
  label: string;
  start_at: string;
  end_at: string;
  status: 'active' | 'closed';
  closed_at: string | null;
  planned_by: string[];
}

// ---------------------------------------------------------------------------
// Calendar

/** Start and end of the sprint containing `now`. */
export function sprintWindow(now: Date): { start: Date; end: Date } {
  const local = zonedParts(now);
  let startDate = addDays(local.year, local.month, local.day, -((local.weekday - BOUNDARY_WEEKDAY + 7) % 7));
  let start = zonedToUtc(startDate.year, startDate.month, startDate.day, BOUNDARY_HOUR, BOUNDARY_MINUTE);
  if (start > now) {
    // Monday morning, before 12:30: still last week's sprint.
    startDate = addDays(startDate.year, startDate.month, startDate.day, -SPRINT_DAYS);
    start = zonedToUtc(startDate.year, startDate.month, startDate.day, BOUNDARY_HOUR, BOUNDARY_MINUTE);
  }
  const endDate = addDays(startDate.year, startDate.month, startDate.day, SPRINT_DAYS);
  return { start, end: zonedToUtc(endDate.year, endDate.month, endDate.day, BOUNDARY_HOUR, BOUNDARY_MINUTE) };
}

function label(row: SprintRow): string {
  return `Sprint ${row.number} · ${formatShortDate(new Date(row.start_at))} – ${formatShortDate(new Date(row.end_at))}`;
}

function plannedBy(key: string): string[] {
  return (db.prepare('SELECT login FROM tracker_sprint_planned WHERE sprint_key = ?').all(key) as { login: string }[]).map(
    (r) => r.login,
  );
}

function sprintOut(row: SprintRow): SprintInfo {
  return {
    key: row.key,
    number: row.number,
    label: label(row),
    start_at: row.start_at,
    end_at: row.end_at,
    status: row.status,
    closed_at: row.closed_at,
    planned_by: plannedBy(row.key),
  };
}

const getRow = (key: string) => db.prepare('SELECT * FROM tracker_sprints WHERE key = ?').get(key) as SprintRow | undefined;

// ---------------------------------------------------------------------------
// Lifecycle

/** Closes sprints whose time is up, then returns the (possibly new) current sprint. */
export function ensureCurrentSprint(now = new Date()): SprintInfo {
  const nowIso = now.toISOString();
  const expired = db
    .prepare(`SELECT * FROM tracker_sprints WHERE status = 'active' AND end_at <= ? ORDER BY start_at`)
    .all(nowIso) as unknown as SprintRow[];
  for (const row of expired) {
    const summary = buildSummary(row, now);
    db.prepare(`UPDATE tracker_sprints SET status = 'closed', closed_at = ?, summary_json = ? WHERE key = ? AND status = 'active'`).run(
      nowIso,
      JSON.stringify(summary),
      row.key,
    );
  }

  const { start, end } = sprintWindow(now);
  const key = localDate(start);
  const existing = getRow(key);
  if (existing) return sprintOut(existing);

  const latest = db.prepare('SELECT MAX(number) AS n FROM tracker_sprints').get() as { n: number | null };
  db.prepare(`INSERT INTO tracker_sprints (key, number, start_at, end_at, status) VALUES (?, ?, ?, ?, 'active')`).run(
    key,
    (latest.n ?? 0) + 1,
    start.toISOString(),
    end.toISOString(),
  );
  if (latest.n === null) {
    // The very first sprint: everything already assigned to someone starts in it.
    const ids = db
      .prepare(`SELECT id FROM tracker_tasks WHERE status != 'done' AND archived = 0 AND assignee IS NOT NULL`)
      .all() as { id: number }[];
    for (const { id } of ids) joinSprint(id, key);
  }
  return sprintOut(getRow(key)!);
}

/** Puts a task in a sprint (and its history). */
export function joinSprint(taskId: number, key: string): void {
  db.prepare('UPDATE tracker_tasks SET sprint_key = ? WHERE id = ?').run(key, taskId);
  db.prepare('INSERT OR IGNORE INTO tracker_task_sprints (task_id, sprint_key) VALUES (?, ?)').run(taskId, key);
}

/**
 * 'current' -> the current key; 'previous' -> the one before; a real key
 * passes through if that sprint exists; '' / null / 'backlog' -> null.
 * Throws SprintError for anything else.
 */
export function resolveSprintKey(value: unknown, now = new Date()): string | null {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  if (!v || v === 'backlog') return null;
  const current = ensureCurrentSprint(now);
  if (v === 'current') return current.key;
  if (v === 'previous') {
    const prev = previousSprint(current.key);
    if (!prev) throw new SprintError('There is no previous sprint');
    return prev.key;
  }
  if (!getRow(v)) throw new SprintError('Unknown sprint');
  return v;
}

export function previousSprint(key: string): SprintInfo | null {
  const row = getRow(key);
  if (!row) return null;
  const prev = db.prepare('SELECT * FROM tracker_sprints WHERE start_at < ? ORDER BY start_at DESC LIMIT 1').get(row.start_at) as
    | SprintRow
    | undefined;
  return prev ? sprintOut(prev) : null;
}

export function listSprints(now = new Date()): (SprintInfo & { task_count: number })[] {
  ensureCurrentSprint(now);
  const rows = db.prepare('SELECT * FROM tracker_sprints ORDER BY start_at DESC').all() as unknown as SprintRow[];
  const count = db.prepare('SELECT COUNT(*) AS n FROM tracker_task_sprints WHERE sprint_key = ?');
  return rows.map((r) => ({ ...sprintOut(r), task_count: (count.get(r.key) as { n: number }).n }));
}

// ---------------------------------------------------------------------------
// Summaries

export interface SummaryPerson {
  login: string;
  name: string;
  committed: number;
  completed: number;
  todo: number;
  in_progress: number;
  blocked: number;
  helping: number;
  subtasks_total: number;
  subtasks_done: number;
  updates: number;
  commits: number;
  completed_tasks: string[];
  unfinished_tasks: { title: string; status: string }[];
}

export interface SummaryTask {
  id: number;
  title: string;
  owner: string | null;
  owner_name: string | null;
  helpers: string[];
  status: string;
  priority: string;
  task_type: string;
  completed: boolean;
  completed_at: string | null;
  moved_on: boolean;
  archived: boolean;
  subtasks_total: number;
  subtasks_done: number;
}

export interface SprintSummary extends SprintInfo {
  generated_at: string;
  totals: {
    committed: number;
    completed: number;
    completion_pct: number;
    unfinished: number;
    in_progress: number;
    blocked: number;
    todo: number;
    created_in_sprint: number;
    subtasks_checked: number;
    updates: number;
    commits: number;
    commits_merged: number;
  };
  people: SummaryPerson[];
  tasks: SummaryTask[];
  subtasks_checked: { task: string; subtask: string; by: string | null; at: string }[];
  updates: { task: string; author: string; author_name: string; body: string; at: string }[];
  burnup: { date: string; completed: number }[];
}

interface TaskRow {
  id: number;
  title: string;
  assignee: string | null;
  status: string;
  priority: string;
  task_type: string;
  sprint_key: string | null;
  archived: number;
  completed_at: string | null;
  created_at: string;
}

/** Live summary of one sprint. Closed sprints store this at close time. */
function buildSummary(row: SprintRow, now: Date): SprintSummary {
  const start = row.start_at;
  const end = row.end_at;
  const cutoff = new Date(Math.min(Date.parse(end), now.getTime()));
  const inWindow = (at: string | null) => Boolean(at) && at! >= start && at! < end;
  const names = memberNames();
  const nameOf = (login: string) => names.get(login.toLowerCase()) ?? login;
  const lc = (s: string | null) => s?.toLowerCase() ?? null;

  const tasks = db
    .prepare(
      `SELECT t.* FROM tracker_tasks t JOIN tracker_task_sprints s ON s.task_id = t.id WHERE s.sprint_key = ?`,
    )
    .all(row.key) as unknown as TaskRow[];
  const subtaskStmt = db.prepare('SELECT * FROM tracker_subtasks WHERE task_id = ?');
  const updateStmt = db.prepare('SELECT * FROM tracker_updates WHERE task_id = ? AND created_at >= ? AND created_at < ?');
  const commitStmt = db.prepare(
    `SELECT c.author_login, c.on_default, c.authored_at FROM tracker_commits tc
       JOIN gh_commits c ON c.repo = tc.repo AND c.sha = tc.sha
      WHERE tc.task_id = ? AND c.authored_at >= ? AND c.authored_at < ?`,
  );

  const people = new Map<string, SummaryPerson>();
  const person = (login: string | null): SummaryPerson | null => {
    if (!login) return null;
    const key = login.toLowerCase();
    let p = people.get(key);
    if (!p) {
      p = {
        login,
        name: nameOf(login),
        committed: 0,
        completed: 0,
        todo: 0,
        in_progress: 0,
        blocked: 0,
        helping: 0,
        subtasks_total: 0,
        subtasks_done: 0,
        updates: 0,
        commits: 0,
        completed_tasks: [],
        unfinished_tasks: [],
      };
      people.set(key, p);
    }
    return p;
  };
  const isMember = (login: string | null) => Boolean(login && names.has(login.toLowerCase()));

  const taskRows: SummaryTask[] = [];
  const checked: SprintSummary['subtasks_checked'] = [];
  const updates: SprintSummary['updates'] = [];
  let commits = 0;
  let commitsMerged = 0;
  let createdInSprint = 0;

  for (const t of tasks) {
    const doneAt = t.status === 'done' ? t.completed_at : null;
    const completed = inWindow(doneAt);
    const subtasks = subtaskStmt.all(t.id) as { title: string; assignee: string | null; done: number; done_at: string | null; done_by: string | null }[];
    const helpers = [...new Set(subtasks.map((s) => s.assignee).filter((a): a is string => !!a && lc(a) !== lc(t.assignee)))];
    const taskRow: SummaryTask = {
      id: t.id,
      title: t.title,
      owner: t.assignee,
      owner_name: t.assignee ? nameOf(t.assignee) : null,
      helpers: helpers.sort(),
      status: t.status,
      priority: t.priority,
      task_type: t.task_type,
      completed,
      completed_at: completed ? doneAt : null,
      // Carried into a later sprint or back to the backlog.
      moved_on: t.sprint_key !== row.key,
      archived: Boolean(t.archived),
      subtasks_total: subtasks.length,
      subtasks_done: subtasks.filter((s) => s.done).length,
    };
    taskRows.push(taskRow);
    if (inWindow(t.created_at)) createdInSprint++;

    const owner = person(t.assignee);
    if (owner) {
      owner.committed++;
      if (completed) {
        owner.completed++;
        owner.completed_tasks.push(t.title);
      } else {
        if (t.status === 'in-progress') owner.in_progress++;
        else if (t.status === 'blocked') owner.blocked++;
        else owner.todo++;
        owner.unfinished_tasks.push({ title: t.title, status: t.status });
      }
    }
    for (const h of helpers) person(h)!.helping++;
    for (const s of subtasks) {
      const sp = person(s.assignee ?? t.assignee);
      if (sp) {
        sp.subtasks_total++;
        if (s.done) sp.subtasks_done++;
      }
      if (s.done && inWindow(s.done_at)) checked.push({ task: t.title, subtask: s.title, by: s.done_by, at: s.done_at! });
    }
    for (const u of updateStmt.all(t.id, start, end) as { body: string; author: string; created_at: string }[]) {
      updates.push({ task: t.title, author: u.author, author_name: nameOf(u.author), body: u.body.slice(0, 500), at: u.created_at });
      if (isMember(u.author)) person(u.author)!.updates++;
    }
    for (const c of commitStmt.all(t.id, start, end) as { author_login: string | null; on_default: number }[]) {
      commits++;
      if (c.on_default) commitsMerged++;
      if (isMember(c.author_login)) person(c.author_login)!.commits++;
    }
  }

  const completedRows = taskRows.filter((r) => r.completed);
  const unfinished = taskRows.filter((r) => !r.completed);

  // Completed-by-day, one point per local day from the first to today (or the last).
  const burnup: SprintSummary['burnup'] = [];
  const doneDays = completedRows.map((r) => localDate(new Date(r.completed_at!))).sort();
  const lastDay = localDate(new Date(cutoff.getTime() - 1));
  for (let d = localDate(new Date(start)); d <= lastDay; ) {
    const date = d;
    burnup.push({ date, completed: doneDays.filter((x) => x <= date).length });
    const [y, m, dd] = d.split('-').map(Number);
    d = isoDate(addDays(y, m, dd, 1));
  }

  const committed = taskRows.length;
  updates.sort((a, b) => b.at.localeCompare(a.at));
  checked.sort((a, b) => b.at.localeCompare(a.at));
  return {
    ...sprintOut(row),
    generated_at: now.toISOString(),
    totals: {
      committed,
      completed: completedRows.length,
      completion_pct: committed ? Math.round((100 * completedRows.length) / committed) : 0,
      unfinished: unfinished.length,
      in_progress: unfinished.filter((r) => r.status === 'in-progress').length,
      blocked: unfinished.filter((r) => r.status === 'blocked').length,
      todo: unfinished.filter((r) => r.status !== 'in-progress' && r.status !== 'blocked').length,
      created_in_sprint: createdInSprint,
      subtasks_checked: checked.length,
      updates: updates.length,
      commits,
      commits_merged: commitsMerged,
    },
    people: [...people.values()].sort((a, b) => b.committed - a.committed || a.name.localeCompare(b.name)),
    tasks: taskRows.sort((a, b) => Number(!a.completed) - Number(!b.completed) || a.title.localeCompare(b.title)),
    subtasks_checked: checked.slice(0, MAX_LISTED),
    updates: updates.slice(0, MAX_LISTED),
    burnup,
  };
}

/** The frozen summary for a closed sprint, a live one for the active sprint. */
export function getSummary(key: string, now = new Date()): SprintSummary | null {
  ensureCurrentSprint(now);
  const row = getRow(key);
  if (!row) return null;
  if (row.status === 'closed' && row.summary_json) {
    // planned_by and the like can change after the close.
    return { ...(JSON.parse(row.summary_json) as SprintSummary), ...sprintOut(row) };
  }
  return buildSummary(row, now);
}

export interface PersonalSummary {
  key: string;
  number: number;
  label: string;
  start_at: string;
  end_at: string;
  status: string;
  person: Pick<SummaryPerson, 'login' | 'committed' | 'completed' | 'updates' | 'commits' | 'subtasks_done' | 'subtasks_total' | 'helping'>;
  tasks: SummaryTask[];
  subtasks_checked: SprintSummary['subtasks_checked'];
  updates: SprintSummary['updates'];
}

/** One person's slice of a sprint summary: their totals plus the tasks they were involved in. */
export function personalSummary(summary: SprintSummary, login: string): PersonalSummary {
  const me = login.toLowerCase();
  const is = (l: string | null) => l?.toLowerCase() === me;
  const p = summary.people.find((x) => is(x.login));
  return {
    key: summary.key,
    number: summary.number,
    label: summary.label,
    start_at: summary.start_at,
    end_at: summary.end_at,
    status: summary.status,
    person: p ?? { login, committed: 0, completed: 0, updates: 0, commits: 0, subtasks_done: 0, subtasks_total: 0, helping: 0 },
    tasks: summary.tasks.filter((t) => is(t.owner) || t.helpers.some(is)),
    subtasks_checked: summary.subtasks_checked.filter((c) => is(c.by)),
    updates: summary.updates.filter((u) => is(u.author)),
  };
}

export function markPlanned(key: string, login: string): void {
  db.prepare('INSERT OR IGNORE INTO tracker_sprint_planned (sprint_key, login) VALUES (?, ?)').run(key, login);
}
