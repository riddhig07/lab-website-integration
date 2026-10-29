// Tools the tracker assistant can call. Each runs as the signed-in member who
// is chatting, through the same functions the tracker routes use, so it can
// do nothing they couldn't do on the board.
import { GitHubError } from '../github/app';
import { getCommit, listCommits, listIssues, listPulls, listRepos, searchOrgIssues } from '../github/repos';
import { createIssueForTask, linkIssue, parseIssueRef } from '../tracker/links';
import { actorOf, listMembers } from '../tracker/people';
import { getSummary, personalSummary, resolveSprintKey } from '../tracker/sprints';
import { memberStats } from '../tracker/stats';
import { relinkCommits } from '../tracker/sync';
import {
  addSubtask,
  createTask,
  deleteSubtask,
  deleteTask,
  listTasks,
  NON_CODE_TYPES,
  parseIds,
  parseSubtasks,
  parseTaskFields,
  patchSubtask,
  patchTask,
  postUpdate,
  PRIORITIES,
  requireTask,
  setArchived,
  STATUSES,
  TASK_TYPES,
  TrackerError,
  type Task,
  type TaskFields,
} from '../tracker/tasks';
import type { User } from '../types';

type Args = Record<string, unknown>;

export interface ToolContext {
  user: User;
  /** Mutations made this turn, streamed to the portal so it can refresh. */
  actions: { op: string; task_id?: number; title?: string; detail?: string }[];
}

const SUBTASK_ITEM = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    assignee: { type: 'string', description: "Optional team member's GitHub login. Omit to leave it with the task's assignee." },
  },
  required: ['title'],
};

const TASK_ID = { type: 'integer', description: 'The task id (the number in T-12).' };

export const TOOL_DECLARATIONS = [
  {
    name: 'list_team',
    description: "List the lab's team on the tracker: GitHub login, name, role, whether they have Slack linked, active.",
    parameters: { type: 'object', properties: { active_only: { type: 'boolean', description: 'Only active members (default true).' } } },
  },
  {
    name: 'list_tasks',
    description:
      'List tracker tasks, optionally filtered. Returns id, ref (T-12), title, description, assignee (GitHub login), status, task_type, priority, scope, sprint_key, subtasks (id/title/assignee/done; a null subtask assignee means the task assignee owns it), the 3 latest progress updates plus update_count, linked GitHub issues/PRs, and linked_commit_count. Priority (P0-P4) is independent of task_type. Scope is a 1-5 effort estimate.',
    parameters: {
      type: 'object',
      properties: {
        assignee: { type: 'string', description: 'GitHub login: tasks they own plus tasks where they hold a subtask.' },
        status: { type: 'string', enum: [...STATUSES] },
        task_type: { type: 'string', enum: [...TASK_TYPES] },
        priority: { type: 'string', enum: [...PRIORITIES] },
        scope: { type: 'integer', description: '1-5' },
        archived: { type: 'boolean', description: 'true: only archived (finished, hidden) tasks. Default false.' },
        sprint: { type: 'string', description: "'current', 'previous', a sprint key (YYYY-MM-DD start date), or 'backlog'. Omit for all." },
        query: { type: 'string', description: 'Text in the title or description.' },
      },
    },
  },
  {
    name: 'get_sprint_summary',
    description:
      'Summary of a weekly sprint (Saturday 11:00 to Saturday 11:00 lab time): committed vs completed, completion %, unfinished work by status, subtasks checked, updates, commits, a per-person breakdown and the task list. Closed sprints return the summary frozen at close.',
    parameters: {
      type: 'object',
      properties: {
        sprint: { type: 'string', description: "'current' (default), 'previous', or a sprint key." },
        login: { type: 'string', description: "Optional: just this person's slice." },
      },
    },
  },
  {
    name: 'get_member_stats',
    description: "Each active member's GitHub activity over the last 7 days across all lab repos and branches: commits (merged to the default branch vs still on a branch) and lines added/removed.",
    parameters: { type: 'object', properties: { login: { type: 'string', description: 'Optional: just this GitHub login.' } } },
  },
  {
    name: 'list_repos',
    description: "The lab's GitHub repositories with description, language, open issue and PR counts, and last push.",
  },
  {
    name: 'list_issues',
    description: 'GitHub issues (or pull requests) in one repo, or across every lab repo when repo is omitted.',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/name. Omit to search the whole org.' },
        kind: { type: 'string', enum: ['issue', 'pr'], description: 'Default issue.' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Default open.' },
        query: { type: 'string', description: 'Text to search for (org-wide search only).' },
      },
    },
  },
  {
    name: 'list_commits',
    description: 'Commits in a lab repo, newest first: sha, message (first line), author, date, url. Filter by branch, author, path, time window or message text. Use get_commit for the diff.',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/name' },
        branch: { type: 'string', description: 'Branch name; default branch if omitted.' },
        author: { type: 'string', description: 'GitHub login.' },
        since_days: { type: 'integer', description: '1-90, default 7.' },
        path: { type: 'string', description: 'Only commits touching this file or directory.' },
        query: { type: 'string', description: 'Case-insensitive text in the commit message.' },
        limit: { type: 'integer', description: '1-50, default 20.' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'get_commit',
    description: 'One commit in detail: full message, author, parents, line stats and changed files with diffs (truncated for large commits).',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/name' },
        sha: { type: 'string', description: 'Full or abbreviated sha (7+ characters).' },
        include_patch: { type: 'boolean', description: 'Include diffs (default true).' },
        path: { type: 'string', description: 'Only files whose path starts with this.' },
      },
      required: ['repo', 'sha'],
    },
  },
  {
    name: 'get_task_commits',
    description: 'Commits linked to a task (by T-<id>, a linked issue number, or its title in the message), with merged/on-branch status.',
    parameters: { type: 'object', properties: { task_id: TASK_ID }, required: ['task_id'] },
  },
  {
    name: 'get_task_updates',
    description: "A task's progress-update history, newest first.",
    parameters: { type: 'object', properties: { task_id: TASK_ID, limit: { type: 'integer', description: '1-100, default 20.' } }, required: ['task_id'] },
  },
  {
    name: 'create_task',
    description:
      "Create a task. Defaults: task_type 'research', priority 'none', status 'todo', and the current sprint when it has an assignee (else the backlog). Use status 'blocked' when work is explicitly blocked.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string', description: 'Markdown.' },
        assignee: { type: 'string', description: "A team member's GitHub login. Omit for unassigned." },
        task_type: { type: 'string', enum: [...TASK_TYPES] },
        priority: { type: 'string', enum: [...PRIORITIES] },
        status: { type: 'string', enum: [...STATUSES] },
        scope: { type: 'integer', description: '1-5. Omit if unknown.' },
        sprint: { type: 'string', description: "'current', a sprint key, or 'backlog'." },
        subtasks: { type: 'array', items: SUBTASK_ITEM, description: 'Checklist items; give one its own assignee to split the task across people.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    description: 'Change fields on a task. Only pass what changes.',
    parameters: {
      type: 'object',
      properties: {
        task_id: TASK_ID,
        title: { type: 'string' },
        description: { type: 'string' },
        assignee: { type: 'string', nullable: true, description: 'GitHub login, or null to unassign.' },
        task_type: { type: 'string', enum: [...TASK_TYPES] },
        priority: { type: 'string', enum: [...PRIORITIES] },
        status: { type: 'string', enum: [...STATUSES] },
        scope: { type: 'integer' },
        pm_note: { type: 'string' },
        sprint: { type: 'string', description: "'current', a sprint key, or 'backlog'." },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'add_subtasks',
    description: 'Append checklist subtasks to a task, each optionally assigned to someone else.',
    parameters: { type: 'object', properties: { task_id: TASK_ID, subtasks: { type: 'array', items: SUBTASK_ITEM } }, required: ['task_id', 'subtasks'] },
  },
  {
    name: 'assign_subtask',
    description: "Hand a subtask to a team member, or pass assignee=null to give it back to the task's assignee.",
    parameters: {
      type: 'object',
      properties: { task_id: TASK_ID, subtask_id: { type: 'integer' }, assignee: { type: 'string', nullable: true } },
      required: ['task_id', 'subtask_id', 'assignee'],
    },
  },
  {
    name: 'set_subtask_done',
    description: 'Check off (done=true) or uncheck a subtask.',
    parameters: { type: 'object', properties: { task_id: TASK_ID, subtask_id: { type: 'integer' }, done: { type: 'boolean' } }, required: ['task_id', 'subtask_id', 'done'] },
  },
  {
    name: 'delete_subtask',
    description: 'Remove a subtask. Destructive: same confirmation rule as delete_task.',
    parameters: { type: 'object', properties: { task_id: TASK_ID, subtask_id: { type: 'integer' } }, required: ['task_id', 'subtask_id'] },
  },
  {
    name: 'post_update',
    description: 'Post a progress update on a task (optionally about one subtask), as the signed-in member. Only when they ask you to; write it in their words.',
    parameters: { type: 'object', properties: { task_id: TASK_ID, body: { type: 'string' }, subtask_id: { type: 'integer' } }, required: ['task_id', 'body'] },
  },
  {
    name: 'archive_tasks',
    description: "Archive done tasks (hide them from the board) or restore archived ones with archived=false. Tasks that aren't done are skipped.",
    parameters: { type: 'object', properties: { task_ids: { type: 'array', items: { type: 'integer' } }, archived: { type: 'boolean' } }, required: ['task_ids'] },
  },
  {
    name: 'link_issue',
    description: 'Link a task to a GitHub issue or pull request (URL or owner/repo#123). Closing a linked issue marks the task done.',
    parameters: { type: 'object', properties: { task_id: TASK_ID, url: { type: 'string' } }, required: ['task_id', 'url'] },
  },
  {
    name: 'create_issue_from_task',
    description: 'Open a GitHub issue in a lab repo from a task (its title, description and assignee) and link it. This posts to GitHub: only when the member asks for it.',
    parameters: {
      type: 'object',
      properties: { task_id: TASK_ID, repo: { type: 'string', description: 'owner/name' }, labels: { type: 'array', items: { type: 'string' } } },
      required: ['task_id', 'repo'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task (admins only). Destructive: only after the member has clearly confirmed.',
    parameters: { type: 'object', properties: { task_id: TASK_ID }, required: ['task_id'] },
  },
];

const clamp = (v: unknown, def: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def;
};
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function taskView(t: Task) {
  return {
    id: t.id,
    ref: t.ref,
    title: t.title,
    description: t.description ? t.description.slice(0, 500) : null,
    assignee: t.assignee,
    status: t.status,
    task_type: t.task_type,
    priority: t.priority,
    scope: t.scope,
    pm_note: t.pm_note,
    sprint_key: t.sprint_key,
    archived: t.archived,
    subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, assignee: s.assignee, done: s.done })),
    latest_updates: t.updates.slice(0, 3).map((u) => ({ author: u.author, body: u.body, at: u.created_at })),
    update_count: t.updates.length,
    links: t.links.map((l) => ({ ref: `${l.repo}#${l.number}`, kind: l.kind, title: l.title, state: l.state, merged: l.merged })),
    linked_commit_count: t.commits.length,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

/** Task fields from tool args, with 'sprint' mapped to the tracker's sprint_key. */
function taskFields(args: Args, partial: boolean): Partial<TaskFields> {
  const { sprint, task_id: _, subtasks: __, ...rest } = args;
  return parseTaskFields({ ...rest, ...(sprint !== undefined ? { sprint_key: sprint } : {}) }, partial);
}

type Handler = (args: Args, ctx: ToolContext) => unknown;

const HANDLERS: Record<string, Handler> = {
  list_team: (args) => ({
    members: listMembers(args.active_only !== false).map((m) => ({
      login: m.github_login,
      name: m.name,
      role: m.role,
      slack_linked: Boolean(m.slack_user_id),
      active: m.active,
    })),
  }),

  list_tasks: (args) => {
    const tasks = listTasks({
      archived: args.archived === true,
      sprint: str(args.sprint),
      assignee: str(args.assignee),
      status: str(args.status),
      task_type: str(args.task_type),
      priority: str(args.priority),
      scope: args.scope ? Number(args.scope) : undefined,
      q: str(args.query),
    });
    return { total: tasks.length, tasks: tasks.slice(0, 100).map(taskView) };
  },

  get_sprint_summary: (args) => {
    const key = resolveSprintKey(str(args.sprint) ?? 'current');
    const summary = key ? getSummary(key) : null;
    if (!summary) return { error: 'Sprint not found' };
    return str(args.login) ? personalSummary(summary, str(args.login)!) : summary;
  },

  get_member_stats: (args) => {
    const all = memberStats();
    const login = str(args.login)?.toLowerCase();
    return { members: login ? all.filter((m) => m.login.toLowerCase() === login) : all };
  },

  list_repos: async () => ({ repos: await listRepos() }),

  list_issues: async (args) => {
    const state = (['open', 'closed', 'all'].includes(String(args.state)) ? args.state : 'open') as 'open' | 'closed' | 'all';
    const kind = args.kind === 'pr' ? 'pr' : 'issue';
    const repo = str(args.repo);
    const items = repo
      ? await (kind === 'pr' ? listPulls(repo, state) : listIssues(repo, state))
      : await searchOrgIssues({ state, kind, q: str(args.query) });
    return { total: items.length, items: items.slice(0, 50) };
  },

  list_commits: async (args) => {
    const days = clamp(args.since_days, 7, 1, 90);
    const commits = await listCommits(String(args.repo), {
      sha: str(args.branch),
      author: str(args.author),
      path: str(args.path),
      since: new Date(Date.now() - days * 86_400_000).toISOString(),
      maxPages: 3,
    });
    const query = str(args.query)?.toLowerCase();
    const matched = query ? commits.filter((c) => c.message.toLowerCase().includes(query)) : commits;
    return { total_matched: matched.length, commits: matched.slice(0, clamp(args.limit, 20, 1, 50)) };
  },

  get_commit: async (args) => {
    const c = await getCommit(String(args.repo), String(args.sha));
    const prefix = str(args.path);
    let budget = 12_000;
    const files = c.files
      .filter((f) => !prefix || f.filename.startsWith(prefix))
      .slice(0, 60)
      .map((f) => {
        if (args.include_patch === false || !f.patch) return { ...f, patch: undefined };
        const patch = f.patch.slice(0, Math.min(3000, Math.max(0, budget)));
        budget -= patch.length;
        return { ...f, patch: patch.length < f.patch.length ? `${patch}\n…(truncated)` : patch };
      });
    return { ...c, files_changed: c.files.length, files };
  },

  get_task_commits: (args) => {
    const t = requireTask(Number(args.task_id));
    return { task: t.ref, count: t.commits.length, authors: t.commit_authors, commits: t.commits.slice(0, 50) };
  },

  get_task_updates: (args) => {
    const t = requireTask(Number(args.task_id));
    return { task: t.ref, total: t.updates.length, updates: t.updates.slice(0, clamp(args.limit, 20, 1, 100)) };
  },

  create_task: (args, ctx) => {
    const fields = taskFields(args, false) as TaskFields;
    // Default: the current sprint for assigned work, else the backlog.
    if (args.sprint === undefined) fields.sprint_key = fields.assignee ? resolveSprintKey('current') : null;
    const task = createTask(fields, parseSubtasks(args.subtasks), actorOf(ctx.user));
    if (!NON_CODE_TYPES.has(task.task_type)) relinkCommits();
    ctx.actions.push({ op: 'create', task_id: task.id, title: task.title });
    return { created: taskView(task) };
  },

  update_task: (args, ctx) => {
    const id = Number(args.task_id);
    const fields = taskFields(args, true);
    const { task, titleChanged } = patchTask(requireTask(id).id, fields);
    if (titleChanged && !NON_CODE_TYPES.has(task.task_type)) relinkCommits();
    ctx.actions.push({ op: 'update', task_id: id, title: task.title, detail: Object.keys(fields).join(', ') });
    return { updated: Object.keys(fields), task: taskView(task) };
  },

  add_subtasks: (args, ctx) => {
    const id = Number(args.task_id);
    let task = requireTask(id);
    for (const s of parseSubtasks(args.subtasks)) task = addSubtask(id, s);
    ctx.actions.push({ op: 'update', task_id: id, title: task.title, detail: 'subtasks' });
    return { task: taskView(task) };
  },

  assign_subtask: (args, ctx) => {
    const task = patchSubtask(Number(args.task_id), Number(args.subtask_id), { assignee: args.assignee ?? null }, actorOf(ctx.user));
    ctx.actions.push({ op: 'update', task_id: task.id, title: task.title, detail: 'subtask assignee' });
    return { task: taskView(task) };
  },

  set_subtask_done: (args, ctx) => {
    const task = patchSubtask(Number(args.task_id), Number(args.subtask_id), { done: args.done === true }, actorOf(ctx.user));
    ctx.actions.push({ op: 'update', task_id: task.id, title: task.title, detail: 'subtask' });
    return { task: taskView(task) };
  },

  delete_subtask: (args, ctx) => {
    const task = deleteSubtask(Number(args.task_id), Number(args.subtask_id));
    ctx.actions.push({ op: 'update', task_id: task.id, title: task.title, detail: 'removed subtask' });
    return { task: taskView(task) };
  },

  post_update: (args, ctx) => {
    const task = postUpdate(Number(args.task_id), { body: args.body, subtask_id: args.subtask_id }, actorOf(ctx.user));
    ctx.actions.push({ op: 'update', task_id: task.id, title: task.title, detail: 'posted update' });
    return { posted_on: task.ref, title: task.title };
  },

  archive_tasks: (args, ctx) => {
    const archived = args.archived !== false;
    const result = setArchived(parseIds(args.task_ids), archived, actorOf(ctx.user));
    ctx.actions.push({ op: 'update', detail: `${archived ? 'archived' : 'restored'} ${result.updated}` });
    return { archived, ...result };
  },

  link_issue: async (args, ctx) => {
    const task = await linkIssue(Number(args.task_id), parseIssueRef({ url: args.url }));
    ctx.actions.push({ op: 'update', task_id: task.id, title: task.title, detail: 'linked issue' });
    return { task: taskView(task) };
  },

  create_issue_from_task: async (args, ctx) => {
    const task = await createIssueForTask(Number(args.task_id), { repo: args.repo, labels: args.labels }, actorOf(ctx.user));
    const link = task.links.at(-1);
    ctx.actions.push({ op: 'update', task_id: task.id, title: task.title, detail: 'created issue' });
    return { task: task.ref, issue: link ? { ref: `${link.repo}#${link.number}`, url: link.url } : null };
  },

  delete_task: (args, ctx) => {
    if (ctx.user.role !== 'admin') return { error: 'Only lab admins can delete tasks' };
    const task = requireTask(Number(args.task_id));
    deleteTask(task.id);
    ctx.actions.push({ op: 'delete', task_id: task.id, title: task.title });
    return { deleted: task.title };
  },
};

export async function runTool(name: string, args: Args, ctx: ToolContext): Promise<Record<string, unknown>> {
  const handler = HANDLERS[name];
  if (!handler) return { error: `Unknown tool ${name}` };
  try {
    const result = await handler(args ?? {}, ctx);
    return result && typeof result === 'object' && !Array.isArray(result) ? (result as Record<string, unknown>) : { result };
  } catch (err) {
    // Surfaced to the model so it can correct itself.
    if (err instanceof TrackerError || err instanceof GitHubError) return { error: err.message };
    return { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  }
}

/** One short line per tool call, shown as a chip in the chat. */
export function summarizeResult(name: string, r: Record<string, unknown>): string {
  if (r.error) return `error: ${String(r.error)}`;
  const len = (k: string) => (Array.isArray(r[k]) ? (r[k] as unknown[]).length : 0);
  switch (name) {
    case 'list_team':
      return `${len('members')} members`;
    case 'list_tasks':
      return `${r.total} task${r.total === 1 ? '' : 's'}`;
    case 'get_member_stats':
      return `${len('members')} members`;
    case 'list_repos':
      return `${len('repos')} repos`;
    case 'list_issues':
      return `${r.total} item${r.total === 1 ? '' : 's'}`;
    case 'list_commits':
      return `${len('commits')} of ${r.total_matched} commits`;
    case 'get_commit':
      return `${String(r.sha).slice(0, 7)} · ${r.files_changed} files`;
    case 'get_task_commits':
      return `${r.count} linked commits`;
    case 'get_task_updates':
      return `${len('updates')} of ${r.total} updates`;
    case 'get_sprint_summary': {
      const t = r.totals as { completed: number; committed: number; completion_pct: number } | undefined;
      const p = r.person as { completed: number; committed: number } | undefined;
      return t ? `${r.label}: ${t.completed}/${t.committed} done (${t.completion_pct}%)` : `${r.label}: ${p?.completed ?? 0}/${p?.committed ?? 0} done`;
    }
    case 'create_task':
      return `created "${(r.created as { title: string }).title}"`;
    case 'update_task':
      return `updated ${(r.updated as string[]).join(', ') || 'task'}`;
    case 'archive_tasks':
      return `${r.archived ? 'archived' : 'restored'} ${r.updated}${r.skipped ? `, skipped ${r.skipped}` : ''}`;
    case 'post_update':
      return `posted on ${r.posted_on}`;
    case 'create_issue_from_task':
      return `opened ${(r.issue as { ref: string } | null)?.ref ?? 'issue'}`;
    case 'delete_task':
      return `deleted "${r.deleted}"`;
    default:
      return 'ok';
  }
}

/**
 * What the portal draws for a tool call: a compact, typed slice of the result
 * (the model sees the full result; the browser only needs enough to show it).
 */
export type ToolView =
  | { kind: 'tasks'; total: number; items: { id: number; ref: string; title: string; status: string; priority: string; assignee: string | null }[] }
  | { kind: 'people'; items: { login: string; name: string; role: string }[] }
  | { kind: 'bars'; unit: string; items: { label: string; value: number; secondary: number }[]; legend: [string, string] }
  | { kind: 'sprint'; label: string; committed: number; completed: number; pct: number; in_progress: number; blocked: number; todo: number }
  | { kind: 'rows'; total: number; items: { key: string; title: string; meta: string; state?: string; url?: string }[] }
  | { kind: 'commit'; sha: string; message: string; additions: number; deletions: number; files: { name: string; additions: number; deletions: number }[] }
  | { kind: 'error'; message: string };

const ROWS = 8;

const taskItem = (t: ReturnType<typeof taskView>) => ({ id: t.id, ref: t.ref, title: t.title, status: t.status, priority: t.priority, assignee: t.assignee });
const commitRow = (c: { sha: string; message: string; author_login: string | null; author_name: string | null; authored_at: string; url: string }) => ({
  key: c.sha.slice(0, 7),
  title: c.message.split('\n')[0],
  meta: `${c.author_login ?? c.author_name ?? 'unknown'} · ${c.authored_at.slice(0, 10)}`,
  url: c.url,
});

export function viewOf(name: string, r: Record<string, unknown>): ToolView | null {
  if (r.error) return { kind: 'error', message: String(r.error) };
  const list = <T>(k: string) => (Array.isArray(r[k]) ? (r[k] as T[]) : []);
  switch (name) {
    case 'list_tasks': {
      const tasks = list<ReturnType<typeof taskView>>('tasks');
      return { kind: 'tasks', total: Number(r.total ?? tasks.length), items: tasks.slice(0, ROWS).map(taskItem) };
    }
    case 'create_task':
    case 'update_task':
    case 'add_subtasks':
    case 'assign_subtask':
    case 'set_subtask_done':
    case 'delete_subtask':
    case 'link_issue': {
      const t = (r.created ?? r.task) as ReturnType<typeof taskView> | undefined;
      return t && typeof t === 'object' ? { kind: 'tasks', total: 1, items: [taskItem(t)] } : null;
    }
    case 'list_team':
      return { kind: 'people', items: list<{ login: string; name: string; role: string }>('members').map(({ login, name, role }) => ({ login, name, role })) };
    case 'get_member_stats':
      return {
        kind: 'bars',
        unit: 'commits, last 7 days',
        legend: ['merged', 'on a branch'],
        items: list<MemberStatsRow>('members')
          .map((m) => ({ label: m.login, value: m.merged_count, secondary: m.unmerged_count }))
          .sort((a, b) => b.value + b.secondary - (a.value + a.secondary)),
      };
    case 'get_sprint_summary': {
      const t = r.totals as { committed: number; completed: number; completion_pct: number; in_progress: number; blocked: number; todo: number } | undefined;
      if (t) return { kind: 'sprint', label: String(r.label), committed: t.committed, completed: t.completed, pct: t.completion_pct, in_progress: t.in_progress, blocked: t.blocked, todo: t.todo };
      const p = r.person as { committed: number; completed: number } | undefined;
      if (!p) return null;
      const pct = p.committed ? Math.round((p.completed / p.committed) * 100) : 0;
      const open = list<{ status: string; completed: boolean }>('tasks').filter((x) => !x.completed);
      const count = (s: string) => open.filter((x) => x.status === s).length;
      return { kind: 'sprint', label: String(r.label), committed: p.committed, completed: p.completed, pct, in_progress: count('in-progress'), blocked: count('blocked'), todo: count('todo') };
    }
    case 'list_repos': {
      const repos = list<{ full_name: string; description: string | null; language: string | null; open_issues: number; open_prs: number; url: string }>('repos');
      return {
        kind: 'rows',
        total: repos.length,
        items: repos.slice(0, ROWS).map((x) => ({
          key: x.full_name.split('/')[1] ?? x.full_name,
          title: x.description ?? '',
          meta: [x.language, `${x.open_issues} issues`, `${x.open_prs} PRs`].filter(Boolean).join(' · '),
          url: x.url,
        })),
      };
    }
    case 'list_issues': {
      const items = list<{ repo: string; number: number; title: string; state: string; merged: boolean; user: string | null; url: string }>('items');
      return {
        kind: 'rows',
        total: Number(r.total ?? items.length),
        items: items.slice(0, ROWS).map((x) => ({
          key: `${x.repo.split('/')[1] ?? x.repo}#${x.number}`,
          title: x.title,
          meta: x.user ? `@${x.user}` : '',
          state: x.merged ? 'merged' : x.state,
          url: x.url,
        })),
      };
    }
    case 'list_commits':
      return { kind: 'rows', total: Number(r.total_matched ?? 0), items: list<CommitRowInput>('commits').slice(0, ROWS).map(commitRow) };
    case 'get_task_commits':
      return { kind: 'rows', total: Number(r.count ?? 0), items: list<CommitRowInput>('commits').slice(0, ROWS).map(commitRow) };
    case 'get_task_updates': {
      const updates = list<{ author: string; body: string; created_at: string }>('updates');
      return {
        kind: 'rows',
        total: Number(r.total ?? updates.length),
        items: updates.slice(0, ROWS).map((u) => ({ key: u.author, title: u.body.slice(0, 160), meta: u.created_at.slice(0, 10) })),
      };
    }
    case 'get_commit': {
      const stats = r.stats as { additions: number; deletions: number } | undefined;
      return {
        kind: 'commit',
        sha: String(r.sha).slice(0, 7),
        message: String(r.message ?? '').split('\n')[0],
        additions: stats?.additions ?? 0,
        deletions: stats?.deletions ?? 0,
        files: list<{ filename: string; additions: number; deletions: number }>('files')
          .slice(0, ROWS)
          .map((f) => ({ name: f.filename, additions: f.additions, deletions: f.deletions })),
      };
    }
    default:
      return null;
  }
}

type MemberStatsRow = { login: string; merged_count: number; unmerged_count: number };
type CommitRowInput = Parameters<typeof commitRow>[0];
