// The task tracker's weekly Slack posts, on the tracker's clock
// (TRACKER_TIMEZONE):
//   Wednesday 09:00  midweek check-in: each person's sprint work, plus a DM to
//                    anyone (with a Slack id) who hasn't posted an update yet
//   Friday 09:00     that DM again, if they still haven't
//   Saturday 11:00   recap of the sprint that just closed
// Each post is recorded in tracker_notifications before sending, so restarts
// and multiple ticks never post twice.
import { config } from '../config';
import { db } from '../db';
import { listMembers, memberNames, type Member } from '../tracker/people';
import { ensureCurrentSprint, getSummary, previousSprint, type SprintSummary } from '../tracker/sprints';
import { listTasks, type Task } from '../tracker/tasks';
import { localDate, zonedParts } from '../tracker/time';
import { postMessage, slackEnabled, trackerChannel } from './client';

const WEDNESDAY = 3;
const FRIDAY = 5;
const SATURDAY = 6;
const MAX_ATTEMPTS = 3;

const boardUrl = () => `${config.siteUrl}/portal/tracker`;
const STATUS_HEADINGS: [Task['status'], string][] = [
  ['todo', 'Not started'],
  ['in-progress', 'In progress'],
  ['blocked', 'Blocked'],
  ['done', 'Done'],
];

const failures = new Map<string, number>();

/** Claims a post for this key; false if it was already sent (or is being sent). */
function claim(kind: string, key: string): boolean {
  return db.prepare('INSERT OR IGNORE INTO tracker_notifications (kind, key) VALUES (?, ?)').run(kind, key).changes > 0;
}

async function once(kind: string, key: string, send: () => Promise<void>): Promise<void> {
  if (!claim(kind, key)) return;
  try {
    await send();
  } catch (err) {
    // Release the claim so the next tick retries, a few times at most.
    const id = `${kind}:${key}`;
    const attempts = (failures.get(id) ?? 0) + 1;
    failures.set(id, attempts);
    if (attempts < MAX_ATTEMPTS) db.prepare('DELETE FROM tracker_notifications WHERE kind = ? AND key = ?').run(kind, key);
    throw err;
  }
}

/** Called every minute by jobs.ts. */
export async function checkSlackSchedule(now = new Date()): Promise<void> {
  if (!slackEnabled) return;
  const local = zonedParts(now);
  const today = localDate(now);
  const minutes = local.hour * 60 + local.minute;

  if (local.weekday === WEDNESDAY && minutes >= 9 * 60) {
    await once('wednesday', today, async () => {
      await postMessage(trackerChannel, midweekMessage());
      await nudgeQuietMembers();
    });
  }
  if (local.weekday === FRIDAY && minutes >= 9 * 60) {
    await once('friday-nudge', today, nudgeQuietMembers);
  }
  if (local.weekday === SATURDAY && minutes >= 11 * 60) {
    await once('saturday', today, async () => {
      // Closes the sprint that just ended (freezing its summary).
      const current = ensureCurrentSprint(now);
      const prev = previousSprint(current.key);
      const summary = prev ? getSummary(prev.key, now) : null;
      if (summary) await postMessage(trackerChannel, recapMessage(summary, current.label));
    });
  }
}

const mention = (m: Member | undefined, fallback: string) => (m?.slack_user_id ? `<@${m.slack_user_id}>` : (m?.name ?? fallback));
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function midweekMessage(): string {
  const sprint = ensureCurrentSprint();
  const tasks = listTasks({ sprint: sprint.key });
  const members = new Map(listMembers(true).map((m) => [m.github_login.toLowerCase(), m]));
  const lines = [`*Midweek check-in · ${sprint.label}*`, `Post an update on anything that moved: <${boardUrl()}|task board>`];

  for (const m of members.values()) {
    const login = m.github_login.toLowerCase();
    const own = tasks.filter((t) => t.assignee?.toLowerCase() === login);
    const handoffs = tasks.flatMap((t) =>
      t.status === 'done' ? [] : t.subtasks.filter((s) => s.assignee?.toLowerCase() === login && t.assignee?.toLowerCase() !== login).map((s) => ({ t, s })),
    );
    if (own.length === 0 && handoffs.length === 0) continue;
    lines.push('', `*${escape(m.name)}* ${m.slack_user_id ? `(<@${m.slack_user_id}>)` : ''}`.trim());
    for (const [status, heading] of STATUS_HEADINGS) {
      const bucket = own.filter((t) => t.status === status);
      if (bucket.length === 0) continue;
      lines.push(`_${heading}_`);
      for (const t of bucket) {
        const progress = t.subtasks.length ? ` (${t.subtask_done_count}/${t.subtasks.length})` : '';
        lines.push(`• ${escape(t.title)}${progress}${t.priority !== 'none' ? ` · ${t.priority}` : ''}`);
        if (status === 'done') continue;
        for (const s of t.subtasks) lines.push(`    ${s.done ? '☑' : '☐'} ${escape(s.title)}`);
        const latest = t.updates[0];
        if (latest) lines.push(`    > ${escape(latest.body.replace(/\s+/g, ' ').slice(0, 200))}`);
      }
    }
    if (handoffs.length) {
      lines.push('_Subtasks on other tasks_');
      for (const { t, s } of handoffs) lines.push(`• ${s.done ? '☑' : '☐'} ${escape(s.title)} (on ${escape(t.title)})`);
    }
  }
  if (lines.length === 2) lines.push('', 'Nothing is planned for this sprint yet.');
  return lines.join('\n');
}

export function recapMessage(s: SprintSummary, nextLabel: string): string {
  const t = s.totals;
  const lines = [
    `*${s.label} recap*`,
    `• Completed ${t.completed} of ${t.committed} committed tasks (${t.completion_pct}%)`,
    `• Unfinished: ${t.in_progress} in progress, ${t.blocked} blocked, ${t.todo} not started`,
    `• Subtasks checked: ${t.subtasks_checked} · Updates posted: ${t.updates} · Commits: ${t.commits} (${t.commits_merged} merged)`,
  ];
  const members = new Map(listMembers().map((m) => [m.github_login.toLowerCase(), m]));
  const people = s.people.filter((p) => p.committed || p.helping || p.updates);
  if (people.length) {
    lines.push('', '*By person*');
    for (const p of people) {
      const extra = p.helping ? `, helped on ${p.helping}` : '';
      lines.push(`• ${mention(members.get(p.login.toLowerCase()), p.name)}: ${p.completed}/${p.committed} done${extra}`);
    }
  }
  const done = s.tasks.filter((x) => x.completed);
  if (done.length) {
    lines.push('', '*Completed*');
    for (const x of done.slice(0, 15)) lines.push(`• ${escape(x.title)}${x.owner_name ? ` (${escape(x.owner_name)})` : ''}`);
    if (done.length > 15) lines.push(`…and ${done.length - 15} more`);
  }
  lines.push('', `${nextLabel} has started: plan your week on the <${boardUrl()}|task board>.`);
  return lines.join('\n');
}

/** DMs active members (with a Slack id) who haven't posted a task update this sprint. */
async function nudgeQuietMembers(): Promise<void> {
  const sprint = ensureCurrentSprint();
  const posted = new Set(
    (db.prepare('SELECT DISTINCT author FROM tracker_updates WHERE created_at >= ?').all(sprint.start_at) as { author: string }[]).map((r) =>
      r.author.toLowerCase(),
    ),
  );
  const names = memberNames();
  for (const m of listMembers(true)) {
    if (!m.slack_user_id || posted.has(m.github_login.toLowerCase())) continue;
    const first = (names.get(m.github_login.toLowerCase()) ?? m.name).split(' ')[0];
    await postMessage(
      m.slack_user_id,
      `Hi ${escape(first)}, you haven't posted an update on the lab task board yet this sprint (${sprint.label}). A line or two on what moved, or what's blocking you, helps everyone: <${boardUrl()}|open the board>.`,
    );
  }
}
