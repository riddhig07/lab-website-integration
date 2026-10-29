// A Slack DM to whoever is handed a task or a subtask, from the board, the task
// dialog, the assistant or sprint planning. Needs only the bot token (not the
// tracker channel) and the member's Slack id. Nobody is told about work that is
// already done, or about work they gave themselves on the board; work the
// assistant hands out always notifies, even when the assignee asked for it.
import { config } from '../config';
import { memberByLogin } from '../tracker/people';
import type { Task } from '../tracker/tasks';
import { postMessage, slackDmEnabled } from './client';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/**
 * DMs everyone `after` newly assigns, compared with `before` (null for a new
 * task). `viaAssistant`: the assistant made the change on `actor`'s behalf.
 * Never throws.
 */
export function notifyAssignments(before: Task | null, after: Task, actor: string, viaAssistant = false): void {
  if (!slackDmEnabled || after.status === 'done' || after.archived) return;

  // login (lowercased) -> what they were given
  const handed = new Map<string, { login: string; task: boolean; subtasks: string[] }>();
  const entry = (login: string) => {
    const key = login.toLowerCase();
    if (!handed.has(key)) handed.set(key, { login, task: false, subtasks: [] });
    return handed.get(key)!;
  };
  if (after.assignee && !same(after.assignee, before?.assignee)) entry(after.assignee).task = true;
  const previous = new Map(before?.subtasks.map((s) => [s.id, s.assignee]) ?? []);
  for (const s of after.subtasks) {
    if (s.done || !s.assignee || same(s.assignee, previous.get(s.id))) continue;
    // Their own task's subtasks come with the task.
    if (same(s.assignee, after.assignee)) continue;
    entry(s.assignee).subtasks.push(s.title);
  }

  const name = escape(memberByLogin(actor)?.name ?? actor);
  const by = viaAssistant ? `The portal assistant (asked by *${name}*)` : `*${name}*`;
  const link = `<${config.siteUrl}/portal/tracker?task=${after.id}|${after.ref} · ${escape(after.title)}>`;
  const details = [after.priority !== 'none' ? after.priority : null, after.task_type, after.scope ? `scope ${after.scope}` : null]
    .filter(Boolean)
    .join(' · ');

  for (const { login, task, subtasks } of handed.values()) {
    if (same(login, actor) && !viaAssistant) continue;
    const slackId = memberByLogin(login)?.slack_user_id;
    if (!slackId) continue;
    const lines = task
      ? [`${by} assigned you ${link}`, details]
      : [`${by} gave you ${subtasks.length === 1 ? 'a subtask' : `${subtasks.length} subtasks`} on ${link}`];
    for (const title of subtasks) lines.push(`• ${escape(title)}`);
    postMessage(slackId, lines.filter(Boolean).join('\n')).catch((err) =>
      console.error(`[slack] assignment DM to ${login} failed:`, err instanceof Error ? err.message : err),
    );
  }
}
