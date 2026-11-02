import { Router, type ErrorRequestHandler, type Request } from 'express';
import { requireRole } from '../auth/session';
import { config } from '../config';
import { db } from '../db';
import { githubAppEnabled, GitHubError } from '../github/app';
import { DriveError } from '../google/drive';
import { notifyAssignments } from '../slack/assignments';
import { listSlackUsers, slackEnabled } from '../slack/client';
import { linkDoc, parseDocRef, unlinkDoc } from '../tracker/docs';
import { createIssueForTask, linkIssue, parseIssueRef, unlinkIssue } from '../tracker/links';
import { actorOf, getMember, listMembers, memberByLogin, parseMemberInput, ROLES, updateMember, upsertMember, type MemberInput } from '../tracker/people';
import { applyPlan, parsePlan, planningFor } from '../tracker/planning';
import { getSummary, listSprints, personalSummary, SprintError } from '../tracker/sprints';
import { memberStats, overall } from '../tracker/stats';
import { relinkCommits, runSync, syncStatus } from '../tracker/sync';
import {
  addSubtask,
  createTask,
  deleteSubtask,
  deleteTask,
  deleteUpdate,
  listTasks,
  moveTask,
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
  type TaskFields,
} from '../tracker/tasks';

// The lab's task tracker (mounted under /api/internal, which requires a
// session). Every member can plan and edit work; deleting a task or taking
// someone off the team is for admins, like deleting content elsewhere.
export const trackerRouter = Router();

const actor = (res: { locals: { user?: Parameters<typeof actorOf>[0] } }) => actorOf(res.locals.user!);
const idParam = (req: Request, name = 'id') => {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new TrackerError(400, 'Invalid id');
  return n;
};
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** What the board needs to know about the server and the viewer. */
trackerRouter.get('/config', (_req, res) => {
  const user = res.locals.user!;
  res.json({
    ai_enabled: Boolean(config.anthropic.apiKey),
    github_enabled: githubAppEnabled,
    slack_enabled: slackEnabled,
    timezone: config.tracker.timezone,
    me: { actor: actorOf(user), member: memberByLogin(user.github_login), is_admin: user.role === 'admin' },
    task_types: TASK_TYPES,
    non_code_types: [...NON_CODE_TYPES],
    priorities: PRIORITIES,
    statuses: STATUSES,
    roles: ROLES,
  });
});

// ---------------------------------------------------------------------------
// Team

trackerRouter.get('/team', (_req, res) => {
  res.json(listMembers());
});

/** The Slack workspace's people, to pick a member's Slack account from. */
trackerRouter.get('/slack-users', async (_req, res) => {
  res.json(await listSlackUsers());
});

trackerRouter.post('/team', (req, res) => {
  const input = parseMemberInput(req.body, false);
  if ('error' in input) throw new TrackerError(400, input.error as string);
  res.status(201).json(upsertMember(input as MemberInput));
});

trackerRouter.patch('/team/:id', (req, res) => {
  const input = parseMemberInput(req.body, true);
  if ('error' in input) throw new TrackerError(400, input.error as string);
  if ('active' in input && res.locals.user!.role !== 'admin') throw new TrackerError(403, 'Only admins can deactivate members');
  const id = idParam(req);
  const fields = input as Partial<MemberInput>;
  if (fields.github_login) {
    const other = db.prepare('SELECT id FROM tracker_members WHERE github_login = ? AND id != ?').get(fields.github_login, id);
    if (other) throw new TrackerError(409, `@${fields.github_login} is already on the team`);
  }
  const member = updateMember(id, fields);
  if (!member) throw new TrackerError(404, 'Member not found');
  res.json(member);
});

/** Soft delete: deactivated members leave the board but keep their history. */
trackerRouter.delete('/team/:id', requireRole('admin'), (req, res) => {
  if (!getMember(idParam(req))) throw new TrackerError(404, 'Member not found');
  updateMember(idParam(req), { active: false });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Tasks

trackerRouter.get('/tasks', (req, res) => {
  const scope = Number(req.query.scope);
  res.json(
    listTasks({
      archived: req.query.archived === 'true',
      sprint: str(req.query.sprint),
      assignee: str(req.query.assignee),
      status: str(req.query.status),
      task_type: str(req.query.task_type),
      priority: str(req.query.priority),
      scope: Number.isInteger(scope) && scope > 0 ? scope : undefined,
      q: str(req.query.q),
    }),
  );
});

trackerRouter.get('/tasks/:id', (req, res) => {
  res.json(requireTask(idParam(req)));
});

trackerRouter.post('/tasks', async (req, res) => {
  const fields = parseTaskFields(req.body, false) as TaskFields;
  const subtasks = parseSubtasks(req.body?.subtasks);
  // Optionally tracks an existing GitHub issue: { link: { url } | { repo, number } }.
  const ref = req.body?.link ? parseIssueRef(req.body.link) : null;
  let task = createTask(fields, subtasks, actor(res));
  notifyAssignments(null, task, actor(res));
  if (ref) task = await linkIssue(task.id, ref);
  else if (!NON_CODE_TYPES.has(task.task_type)) relinkCommits();
  res.status(201).json(requireTask(task.id));
});

trackerRouter.patch('/tasks/:id', (req, res) => {
  const before = requireTask(idParam(req));
  const { task, titleChanged } = patchTask(before.id, parseTaskFields(req.body, true));
  notifyAssignments(before, task, actor(res));
  if (titleChanged && !NON_CODE_TYPES.has(task.task_type)) relinkCommits();
  res.json(requireTask(task.id));
});

/** A drag on the board: { status?, assignee?, position? }. */
trackerRouter.post('/tasks/:id/move', (req, res) => {
  const before = requireTask(idParam(req));
  const task = moveTask(before.id, req.body);
  notifyAssignments(before, task, actor(res));
  res.json(task);
});

trackerRouter.delete('/tasks/:id', requireRole('admin'), (req, res) => {
  deleteTask(idParam(req));
  res.status(204).end();
});

trackerRouter.post('/tasks/archive', (req, res) => {
  res.json(setArchived(parseIds(req.body?.task_ids), true, actor(res)));
});

trackerRouter.post('/tasks/unarchive', (req, res) => {
  res.json(setArchived(parseIds(req.body?.task_ids), false, actor(res)));
});

trackerRouter.post('/tasks/:id/subtasks', (req, res) => {
  const [input] = parseSubtasks([{ title: req.body?.title, assignee: req.body?.assignee }]);
  if (!input) throw new TrackerError(400, 'Title is required');
  const before = requireTask(idParam(req));
  const task = addSubtask(before.id, input);
  notifyAssignments(before, task, actor(res));
  res.status(201).json(task);
});

trackerRouter.patch('/tasks/:id/subtasks/:sid', (req, res) => {
  const before = requireTask(idParam(req));
  const task = patchSubtask(before.id, idParam(req, 'sid'), req.body, actor(res));
  notifyAssignments(before, task, actor(res));
  res.json(task);
});

trackerRouter.delete('/tasks/:id/subtasks/:sid', (req, res) => {
  res.json(deleteSubtask(idParam(req), idParam(req, 'sid')));
});

trackerRouter.post('/tasks/:id/updates', (req, res) => {
  res.status(201).json(postUpdate(idParam(req), req.body, actor(res)));
});

trackerRouter.delete('/tasks/:id/updates/:uid', (req, res) => {
  res.json(deleteUpdate(idParam(req), idParam(req, 'uid'), actor(res)));
});

trackerRouter.post('/tasks/:id/links', async (req, res) => {
  res.status(201).json(await linkIssue(idParam(req), parseIssueRef(req.body)));
});

trackerRouter.delete('/tasks/:id/links/:lid', (req, res) => {
  res.json(unlinkIssue(idParam(req), idParam(req, 'lid')));
});

/** Links a Google Doc or Drive file: { url } or { file_id }. */
trackerRouter.post('/tasks/:id/docs', async (req, res) => {
  res.status(201).json(await linkDoc(idParam(req), parseDocRef(req.body), res.locals.user!.id, actor(res)));
});

trackerRouter.delete('/tasks/:id/docs/:did', (req, res) => {
  res.json(unlinkDoc(idParam(req), idParam(req, 'did')));
});

/** Opens a GitHub issue for the task in { repo } and links it. */
trackerRouter.post('/tasks/:id/create-issue', async (req, res) => {
  res.status(201).json(await createIssueForTask(idParam(req), req.body, actor(res)));
});

/** Tasks that link to a GitHub issue or pull request. */
trackerRouter.get('/linked', (req, res) => {
  const repo = str(req.query.repo);
  const number = Number(req.query.number);
  if (!repo || !Number.isInteger(number)) throw new TrackerError(400, 'repo and number are required');
  const ids = db.prepare('SELECT task_id FROM tracker_links WHERE repo = ? COLLATE NOCASE AND number = ?').all(repo, number) as { task_id: number }[];
  res.json(ids.map((r) => requireTask(r.task_id)));
});

// ---------------------------------------------------------------------------
// GitHub sync and stats

trackerRouter.post('/sync', async (req, res) => {
  res.json(await runSync({ force: req.body?.force === true }));
});

trackerRouter.get('/sync/status', (_req, res) => {
  res.json(syncStatus());
});

trackerRouter.get('/stats/members', (_req, res) => {
  res.json(memberStats());
});

trackerRouter.get('/stats/overall', async (req, res) => {
  if (!githubAppEnabled) throw new TrackerError(503, 'The GitHub App is not set up');
  res.json(await overall(str(req.query.repo)));
});

// ---------------------------------------------------------------------------
// Sprints

trackerRouter.get('/sprints', (_req, res) => {
  res.json(listSprints());
});

/** The current sprint, plus whether the caller still has to plan it (drives the planning prompt). */
trackerRouter.get('/sprints/current', (_req, res) => {
  const planning = planningFor(res.locals.user!.github_login);
  res.json({ ...planning.sprint, planning_needed: planning.needed, member: planning.member });
});

/** The caller's previous-sprint wrap-up plus the tasks they can carry over or pick up. */
trackerRouter.get('/sprints/planning', (_req, res) => {
  res.json(planningFor(res.locals.user!.github_login));
});

trackerRouter.get('/sprints/:key/summary', (req, res) => {
  const summary = getSummary(req.params.key);
  if (!summary) throw new TrackerError(404, 'Sprint not found');
  const login = str(req.query.login);
  res.json(login ? personalSummary(summary, login) : summary);
});

trackerRouter.post('/sprints/:key/plan', (req, res) => {
  const result = applyPlan(req.params.key, res.locals.user!.github_login, parsePlan(req.body));
  if (result.link_commits) relinkCommits();
  res.json(result);
});

const trackerErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof SprintError) err = new TrackerError(400, err.message);
  if (!(err instanceof TrackerError) && !(err instanceof GitHubError) && !(err instanceof DriveError)) return next(err);
  if (err.status >= 500) console.error('[tracker]', err.message);
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(err.status === 202 ? 503 : err.status).json({ error: err.status === 202 ? 'GitHub is still computing, try again shortly' : err.message });
};
trackerRouter.use(trackerErrors);
