// The assistant's task-board tools. Each runs as the signed-in member who is
// chatting, through the same functions the tracker routes use, so it can do
// nothing they couldn't do on the board.
import { db } from '../db';
import { githubAppEnabled } from '../github/app';
import { linkDoc, parseDocRef, unlinkDoc } from '../tracker/docs';
import { createIssueForTask, linkIssue, parseIssueRef, unlinkIssue } from '../tracker/links';
import { actorOf, listMembers, parseMemberInput, ROLES, updateMember, upsertMember, type MemberInput } from '../tracker/people';
import { getSummary, listSprints, personalSummary, resolveSprintKey } from '../tracker/sprints';
import { memberStats, overall } from '../tracker/stats';
import { notifyAssignments } from '../slack/assignments';
import { relinkCommits, runSync } from '../tracker/sync';
import {
  addSubtask,
  createTask,
  deleteSubtask,
  deleteTask,
  deleteUpdate,
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
import { clamp, list, plural, str, VIEW_ROWS, type Args, type Handler, type ToolDeclaration, type ToolModule, type ToolResult, type ToolView } from './toolkit';

const SUBTASK_ITEM = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    assignee: { type: 'string', description: "Optional team member's GitHub login. Omit to leave it with the task's assignee." },
  },
  required: ['title'],
};

const TASK_ID = { type: 'integer', description: 'The task id (the number in T-12).' };
const NULLABLE_LOGIN = { type: ['string', 'null'], description: 'GitHub login, or null to unassign.' };

const declarations: ToolDeclaration[] = [
  {
    name: 'list_team',
    description: "List the lab's team on the tracker: GitHub login, name, role, whether they have Slack linked, active.",
    parameters: { type: 'object', properties: { active_only: { type: 'boolean', description: 'Only active members (default true).' } } },
  },
  {
    name: 'add_member',
    description: "Add someone to the tracker's team (or update them if the login is already there). The GitHub sync adds org members automatically, so this is for people outside the org or to set a role right away.",
    parameters: {
      type: 'object',
      properties: {
        github_login: { type: 'string' },
        name: { type: 'string' },
        role: { type: 'string', enum: [...ROLES] },
        slack_user_id: { type: 'string', description: 'Slack member id like U0123ABCD, for reminders.' },
      },
      required: ['github_login', 'name'],
    },
  },
  {
    name: 'update_member',
    description: "Change a team member's name, role or Slack member id, or deactivate them (active=false; admins only). Deactivated members leave the board but keep their history.",
    parameters: {
      type: 'object',
      properties: {
        github_login: { type: 'string', description: 'Who to change.' },
        name: { type: 'string' },
        role: { type: 'string', enum: [...ROLES] },
        slack_user_id: { type: ['string', 'null'] },
        active: { type: 'boolean' },
      },
      required: ['github_login'],
    },
  },
  {
    name: 'list_tasks',
    description:
      'List tracker tasks, optionally filtered. Returns id, ref (T-12), title, description (first 500 characters), assignee (GitHub login), status, task_type, priority, scope, sprint_key, subtasks (id/title/assignee/done; a null subtask assignee means the task assignee owns it), the 3 latest progress updates plus update_count, linked GitHub issues/PRs (with link_id), and linked_commit_count. Priority (P0-P4) is independent of task_type. Scope is a 1-5 effort estimate.',
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
    name: 'get_task',
    description: 'One task in full: the whole description, every subtask, the 20 latest updates (with update ids), linked issues/PRs (with link ids), linked commit authors and the sprints it has been in.',
    parameters: { type: 'object', properties: { task_id: TASK_ID }, required: ['task_id'] },
  },
  {
    name: 'find_tasks_for_issue',
    description: 'Tasks that link to a GitHub issue or pull request.',
    parameters: { type: 'object', properties: { url: { type: 'string', description: 'Issue URL or owner/repo#123.' } }, required: ['url'] },
  },
  {
    name: 'get_sprint_summary',
    description:
      'Summary of a weekly sprint (Monday 12:30 to Monday 12:30 lab time): committed vs completed, completion %, unfinished work by status, subtasks checked, updates, commits, a per-person breakdown and the task list. Closed sprints return the summary frozen at close.',
    parameters: {
      type: 'object',
      properties: {
        sprint: { type: 'string', description: "'current' (default), 'previous', or a sprint key." },
        login: { type: 'string', description: "Optional: just this person's slice." },
      },
    },
  },
  {
    name: 'list_sprints',
    description: 'Every sprint so far, newest first: key, number, dates, active/closed, how many tasks, and who has planned it.',
  },
  {
    name: 'get_member_stats',
    description: "Each active member's GitHub activity over the last 7 days across all lab repos and branches: commits (merged to the default branch vs still on a branch) and lines added/removed.",
    parameters: { type: 'object', properties: { login: { type: 'string', description: 'Optional: just this GitHub login.' } } },
  },
  {
    name: 'get_lab_activity',
    description: "Commits and lines added/removed per week across the lab's repos (or one repo), plus each contributor's totals. GitHub computes these statistics in the background; repos listed under `computing` aren't counted yet.",
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/name. Omit for all repos.' },
        weeks: { type: 'integer', description: 'How many recent weeks, 1-52 (default 12).' },
      },
    },
  },
  {
    name: 'sync_github',
    description: 'Pull the latest from GitHub now (org members, commits on every branch, linked issue states) instead of waiting for the 10-minute sync. Closing a linked issue marks its task done during a sync.',
    parameters: { type: 'object', properties: { force: { type: 'boolean', description: 'Rescan repos even if nothing was pushed since the last sync.' } } },
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
    description: 'Change fields on a task (including moving it between columns with status, or reassigning it). Only pass what changes.',
    parameters: {
      type: 'object',
      properties: {
        task_id: TASK_ID,
        title: { type: 'string' },
        description: { type: 'string' },
        assignee: NULLABLE_LOGIN,
        task_type: { type: 'string', enum: [...TASK_TYPES] },
        priority: { type: 'string', enum: [...PRIORITIES] },
        status: { type: 'string', enum: [...STATUSES] },
        scope: { type: ['integer', 'null'] },
        pm_note: { type: ['string', 'null'] },
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
      properties: { task_id: TASK_ID, subtask_id: { type: 'integer' }, assignee: NULLABLE_LOGIN },
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
    name: 'delete_update',
    description: 'Delete a progress update. Members can only delete their own updates. Get the update id from get_task.',
    parameters: { type: 'object', properties: { task_id: TASK_ID, update_id: { type: 'integer' } }, required: ['task_id', 'update_id'] },
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
    name: 'unlink_issue',
    description: 'Remove the link between a task and a GitHub issue or pull request. The issue itself is not touched.',
    parameters: {
      type: 'object',
      properties: { task_id: TASK_ID, url: { type: 'string', description: 'Issue URL or owner/repo#123 of the linked issue.' } },
      required: ['task_id', 'url'],
    },
  },
  {
    name: 'link_doc',
    description:
      'Link a Google Doc, Sheet, Slides deck or other Drive file to a task, by its docs.google.com / drive.google.com URL or a Lab Drive file id (from search_drive or list_drive_folder).',
    parameters: {
      type: 'object',
      properties: { task_id: TASK_ID, url: { type: 'string', description: 'The Google Docs / Drive link.' }, file_id: { type: 'string', description: 'A Drive file id, instead of url.' } },
      required: ['task_id'],
    },
  },
  {
    name: 'unlink_doc',
    description: "Remove a linked Google Doc or Drive file from a task (the file itself is not touched). Use the doc's doc_id from get_task.",
    parameters: { type: 'object', properties: { task_id: TASK_ID, doc_id: { type: 'integer' } }, required: ['task_id', 'doc_id'] },
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
    latest_updates: t.updates.slice(0, 3).map((u) => ({ id: u.id, author: u.author, body: u.body, at: u.created_at })),
    update_count: t.updates.length,
    links: t.links.map((l) => ({ link_id: l.id, ref: `${l.repo}#${l.number}`, kind: l.kind, title: l.title, state: l.state, merged: l.merged })),
    // in_lab docs can be read with read_drive_file(file_id).
    docs: t.docs.map((d) => ({ doc_id: d.id, file_id: d.file_id, name: d.name, mime_type: d.mime_type, url: d.url, in_lab: d.in_lab })),
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

function memberInput(args: Args, partial: boolean): Partial<MemberInput> {
  const input = parseMemberInput(args, partial);
  if ('error' in input) throw new TrackerError(400, input.error as string);
  return input as Partial<MemberInput>;
}

const handlers: Record<string, Handler> = {
  list_team: (args) => ({
    members: listMembers(args.active_only !== false).map((m) => ({
      login: m.github_login,
      name: m.name,
      role: m.role,
      slack_linked: Boolean(m.slack_user_id),
      active: m.active,
    })),
  }),

  add_member: (args, ctx) => {
    const member = upsertMember(memberInput(args, false) as MemberInput);
    ctx.actions.push({ op: 'team', detail: `added @${member.github_login}` });
    return { member };
  },

  update_member: (args, ctx) => {
    const { github_login, ...rest } = args;
    const current = db.prepare('SELECT id FROM tracker_members WHERE github_login = ? COLLATE NOCASE').get(String(github_login ?? '').replace(/^@/, '')) as { id: number } | undefined;
    if (!current) return { error: `@${github_login} isn't on the team` };
    const fields = memberInput(rest, true);
    if ('active' in fields && ctx.user.role !== 'admin') return { error: 'Only lab admins can deactivate members' };
    const member = updateMember(current.id, fields);
    ctx.actions.push({ op: 'team', detail: `updated @${member?.github_login}` });
    return { member };
  },

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

  get_task: (args) => {
    const t = requireTask(Number(args.task_id));
    return {
      task: {
        ...taskView(t),
        description: t.description,
        sprint_history: t.sprint_keys,
        updates: t.updates.slice(0, 20).map((u) => ({ id: u.id, author: u.author, body: u.body, subtask_id: u.subtask_id, at: u.created_at })),
        commit_authors: t.commit_authors,
      },
    };
  },

  find_tasks_for_issue: (args) => {
    const ref = parseIssueRef({ url: args.url });
    const ids = db.prepare('SELECT task_id FROM tracker_links WHERE repo = ? COLLATE NOCASE AND number = ?').all(ref.repo, ref.number) as { task_id: number }[];
    const tasks = ids.map((r) => taskView(requireTask(r.task_id)));
    return { issue: `${ref.repo}#${ref.number}`, total: tasks.length, tasks };
  },

  get_sprint_summary: (args) => {
    const key = resolveSprintKey(str(args.sprint) ?? 'current');
    const summary = key ? getSummary(key) : null;
    if (!summary) return { error: 'Sprint not found' };
    return str(args.login) ? personalSummary(summary, str(args.login)!) : summary;
  },

  list_sprints: () => ({ sprints: listSprints() }),

  get_member_stats: (args) => {
    const all = memberStats();
    const login = str(args.login)?.toLowerCase();
    return { members: login ? all.filter((m) => m.login.toLowerCase() === login) : all };
  },

  get_lab_activity: async (args) => {
    if (!githubAppEnabled) return { error: 'The GitHub App is not set up' };
    const data = await overall(str(args.repo));
    const weeks = data.weeks.slice(-clamp(args.weeks, 12, 1, 52));
    return { ...data, weeks, contributors: data.contributors.map(({ weeks: _, ...c }) => c) };
  },

  sync_github: async (args) => {
    if (!githubAppEnabled) return { error: 'The GitHub App is not set up' };
    return { ...(await runSync({ force: args.force === true })) };
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
    notifyAssignments(null, task, actorOf(ctx.user), true);
    if (!NON_CODE_TYPES.has(task.task_type)) relinkCommits();
    ctx.actions.push({ op: 'create', task_id: task.id, title: task.title });
    return { created: taskView(task) };
  },

  update_task: (args, ctx) => {
    const id = Number(args.task_id);
    const fields = taskFields(args, true);
    const before = requireTask(id);
    const { task, titleChanged } = patchTask(before.id, fields);
    notifyAssignments(before, task, actorOf(ctx.user), true);
    if (titleChanged && !NON_CODE_TYPES.has(task.task_type)) relinkCommits();
    ctx.actions.push({ op: 'update', task_id: id, title: task.title, detail: Object.keys(fields).join(', ') });
    return { updated: Object.keys(fields), task: taskView(task) };
  },

  add_subtasks: (args, ctx) => {
    const id = Number(args.task_id);
    const before = requireTask(id);
    let task = before;
    for (const s of parseSubtasks(args.subtasks)) task = addSubtask(id, s);
    notifyAssignments(before, task, actorOf(ctx.user), true);
    ctx.actions.push({ op: 'update', task_id: id, title: task.title, detail: 'subtasks' });
    return { task: taskView(task) };
  },

  assign_subtask: (args, ctx) => {
    const before = requireTask(Number(args.task_id));
    const task = patchSubtask(before.id, Number(args.subtask_id), { assignee: args.assignee ?? null }, actorOf(ctx.user));
    notifyAssignments(before, task, actorOf(ctx.user), true);
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

  delete_update: (args, ctx) => {
    const task = deleteUpdate(Number(args.task_id), Number(args.update_id), actorOf(ctx.user));
    ctx.actions.push({ op: 'update', task_id: task.id, title: task.title, detail: 'deleted update' });
    return { deleted_from: task.ref, title: task.title };
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

  unlink_issue: (args, ctx) => {
    const ref = parseIssueRef({ url: args.url });
    const current = requireTask(Number(args.task_id));
    const link = current.links.find((l) => l.repo.toLowerCase() === ref.repo.toLowerCase() && l.number === ref.number);
    if (!link) return { error: `${current.ref} isn't linked to ${ref.repo}#${ref.number}` };
    const task = unlinkIssue(current.id, link.id);
    ctx.actions.push({ op: 'update', task_id: task.id, title: task.title, detail: 'unlinked issue' });
    return { unlinked: `${link.repo}#${link.number}`, task: taskView(task) };
  },

  link_doc: async (args, ctx) => {
    const ref = parseDocRef(args.file_id ? { file_id: args.file_id } : { url: args.url });
    const task = await linkDoc(Number(args.task_id), ref, ctx.user.id, actorOf(ctx.user));
    const doc = task.docs.find((d) => d.file_id === ref.file_id)!;
    ctx.actions.push({ op: 'update', task_id: task.id, title: task.title, detail: 'linked doc' });
    return { linked: doc.name, readable_with_read_drive_file: doc.in_lab, task: taskView(task) };
  },

  unlink_doc: (args, ctx) => {
    const current = requireTask(Number(args.task_id));
    const doc = current.docs.find((d) => d.id === Number(args.doc_id));
    if (!doc) return { error: `${current.ref} has no linked doc ${args.doc_id}` };
    const task = unlinkDoc(current.id, doc.id);
    ctx.actions.push({ op: 'update', task_id: task.id, title: task.title, detail: 'unlinked doc' });
    return { unlinked: doc.name, task: taskView(task) };
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

function summarize(name: string, r: ToolResult): string | undefined {
  const len = (k: string) => list(r, k).length;
  switch (name) {
    case 'list_team':
      return plural(len('members'), 'member');
    case 'add_member':
    case 'update_member':
      return `@${(r.member as { github_login: string }).github_login}`;
    case 'list_tasks':
    case 'find_tasks_for_issue':
      return plural(Number(r.total), 'task');
    case 'get_task': {
      const t = r.task as { ref: string; title: string };
      return `${t.ref} · ${t.title}`;
    }
    case 'list_sprints':
      return plural(len('sprints'), 'sprint');
    case 'get_member_stats':
      return plural(len('members'), 'member');
    case 'get_lab_activity':
      return `${plural(len('weeks'), 'week')} across ${plural(len('repos'), 'repo')}`;
    case 'sync_github':
      return 'synced';
    case 'get_task_commits':
      return plural(Number(r.count), 'linked commit');
    case 'get_task_updates':
      return `${len('updates')} of ${plural(Number(r.total), 'update')}`;
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
    case 'delete_update':
      return `deleted from ${r.deleted_from}`;
    case 'unlink_issue':
    case 'unlink_doc':
      return `unlinked ${r.unlinked}`;
    case 'link_doc':
      return `linked "${r.linked}"`;
    case 'create_issue_from_task':
      return `opened ${(r.issue as { ref: string } | null)?.ref ?? 'issue'}`;
    case 'delete_task':
      return `deleted "${r.deleted}"`;
    default:
      return undefined;
  }
}

type TaskViewRow = ReturnType<typeof taskView>;
const taskItem = (t: TaskViewRow) => ({ id: t.id, ref: t.ref, title: t.title, status: t.status, priority: t.priority, assignee: t.assignee });

function view(name: string, r: ToolResult): ToolView | null | undefined {
  switch (name) {
    case 'list_tasks':
    case 'find_tasks_for_issue': {
      const tasks = list<TaskViewRow>(r, 'tasks');
      return { kind: 'tasks', total: Number(r.total ?? tasks.length), items: tasks.slice(0, VIEW_ROWS).map(taskItem) };
    }
    case 'get_task':
    case 'create_task':
    case 'update_task':
    case 'add_subtasks':
    case 'assign_subtask':
    case 'set_subtask_done':
    case 'delete_subtask':
    case 'link_issue':
    case 'unlink_issue':
    case 'link_doc':
    case 'unlink_doc': {
      const t = (r.created ?? r.task) as TaskViewRow | undefined;
      return t && typeof t === 'object' ? { kind: 'tasks', total: 1, items: [taskItem(t)] } : null;
    }
    case 'list_team':
      return { kind: 'people', items: list<{ login: string; name: string; role: string }>(r, 'members').map(({ login, name, role }) => ({ login, name, role })) };
    case 'add_member':
    case 'update_member': {
      const m = r.member as { github_login: string; name: string; role: string };
      return { kind: 'people', items: [{ login: m.github_login, name: m.name, role: m.role }] };
    }
    case 'get_member_stats':
      return {
        kind: 'bars',
        unit: 'commits, last 7 days',
        legend: ['merged', 'on a branch'],
        items: list<{ login: string; merged_count: number; unmerged_count: number }>(r, 'members')
          .map((m) => ({ label: m.login, value: m.merged_count, secondary: m.unmerged_count }))
          .sort((a, b) => b.value + b.secondary - (a.value + a.secondary)),
      };
    case 'get_lab_activity':
      return {
        kind: 'columns',
        unit: 'commits per week',
        items: list<{ week: number; commits: number }>(r, 'weeks').map((w) => ({ label: new Date(w.week * 1000).toISOString().slice(5, 10), value: w.commits })),
      };
    case 'list_sprints': {
      const sprints = list<{ key: string; label: string; status: string; task_count: number }>(r, 'sprints');
      return {
        kind: 'rows',
        total: sprints.length,
        items: sprints.slice(0, VIEW_ROWS).map((s) => ({ key: s.key, title: s.label, meta: plural(s.task_count, 'task'), state: s.status === 'active' ? 'open' : 'closed' })),
      };
    }
    case 'get_sprint_summary': {
      const t = r.totals as { committed: number; completed: number; completion_pct: number; in_progress: number; blocked: number; todo: number } | undefined;
      if (t) return { kind: 'sprint', label: String(r.label), committed: t.committed, completed: t.completed, pct: t.completion_pct, in_progress: t.in_progress, blocked: t.blocked, todo: t.todo };
      const p = r.person as { committed: number; completed: number } | undefined;
      if (!p) return null;
      const pct = p.committed ? Math.round((p.completed / p.committed) * 100) : 0;
      const open = list<{ status: string; completed: boolean }>(r, 'tasks').filter((x) => !x.completed);
      const count = (s: string) => open.filter((x) => x.status === s).length;
      return { kind: 'sprint', label: String(r.label), committed: p.committed, completed: p.completed, pct, in_progress: count('in-progress'), blocked: count('blocked'), todo: count('todo') };
    }
    case 'get_task_commits':
      return {
        kind: 'rows',
        total: Number(r.count ?? 0),
        items: list<{ sha: string; message: string; author_login: string | null; author_name: string | null; authored_at: string; url: string; merged: boolean }>(r, 'commits')
          .slice(0, VIEW_ROWS)
          .map((c) => ({
            key: c.sha.slice(0, 7),
            title: c.message.split('\n')[0],
            meta: `${c.author_login ?? c.author_name ?? 'unknown'} · ${c.authored_at.slice(0, 10)}`,
            state: c.merged ? 'merged' : 'open',
            url: c.url,
          })),
      };
    case 'get_task_updates': {
      const updates = list<{ author: string; body: string; created_at: string }>(r, 'updates');
      return {
        kind: 'rows',
        total: Number(r.total ?? updates.length),
        items: updates.slice(0, VIEW_ROWS).map((u) => ({ key: u.author, title: u.body.slice(0, 160), meta: u.created_at.slice(0, 10) })),
      };
    }
    default:
      return undefined;
  }
}

export const trackerTools: ToolModule = { declarations, handlers, summarize, view };
