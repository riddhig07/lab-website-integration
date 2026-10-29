// Linking tasks to GitHub issues and pull requests.
import { config } from '../config';
import { db } from '../db';
import { assertRepo, createIssue, issueState } from '../github/repos';
import { relinkCommits } from './sync';
import { getTask, requireTask, taskRef, TrackerError, type Task } from './tasks';

/** owner/name#123 or a github.com issue / pull request URL. */
export function parseIssueRef(body: unknown): { repo: string; number: number } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.url === 'string') {
    const m = /github\.com\/([\w.-]+\/[\w.-]+)\/(?:issues|pull)\/(\d+)/i.exec(b.url) ?? /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(b.url.trim());
    if (!m) throw new TrackerError(400, 'Paste a GitHub issue or pull request URL (or owner/repo#123)');
    return { repo: m[1], number: Number(m[2]) };
  }
  const number = Number(b.number);
  if (typeof b.repo !== 'string' || !Number.isInteger(number) || number <= 0) throw new TrackerError(400, 'repo and number are required');
  return { repo: b.repo, number };
}

export async function linkIssue(taskId: number, ref: { repo: string; number: number }): Promise<Task> {
  requireTask(taskId);
  const issue = await issueState(ref.repo, ref.number);
  db.prepare(
    `INSERT INTO tracker_links (task_id, repo, kind, number, title, state, merged, url, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (task_id, repo, kind, number) DO UPDATE SET title = excluded.title, state = excluded.state,
       merged = excluded.merged, synced_at = excluded.synced_at`,
  ).run(taskId, issue.repo, issue.is_pr ? 'pr' : 'issue', issue.number, issue.title, issue.state, issue.merged ? 1 : 0, issue.url, new Date().toISOString());
  // Commits mentioning #n in that repo now belong to the task.
  relinkCommits();
  return getTask(taskId)!;
}

export function unlinkIssue(taskId: number, linkId: number): Task {
  if (db.prepare('DELETE FROM tracker_links WHERE id = ? AND task_id = ?').run(linkId, taskId).changes === 0) {
    throw new TrackerError(404, 'Link not found');
  }
  return getTask(taskId)!;
}

/** Opens a GitHub issue for a task (title, description, assignee) and links it. */
export async function createIssueForTask(taskId: number, body: unknown, actor: string): Promise<Task> {
  const task = requireTask(taskId);
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.repo !== 'string') throw new TrackerError(400, 'Pick a repository');
  const repo = await assertRepo(b.repo);
  const labels = Array.isArray(b.labels) ? b.labels.map(String).filter(Boolean).slice(0, 10) : undefined;
  const portalLink = `${config.siteUrl}/portal/tracker?task=${task.id}`;
  const issue = await createIssue(
    repo.full_name,
    {
      title: task.title,
      body: `${task.description ?? ''}\n\nTracked as [${taskRef(task.id)}](${portalLink}) on the lab task board. Mention ${taskRef(task.id)} in commit messages to link them.`.trim(),
      assignees: task.assignee ? [task.assignee] : undefined,
      labels,
    },
    actor,
  );
  return linkIssue(taskId, { repo: issue.repo, number: issue.number });
}
