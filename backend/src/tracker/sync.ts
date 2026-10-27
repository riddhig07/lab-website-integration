// Pulls GitHub activity into the tracker: org members onto the team, recent
// commits on every branch of every repo (gh_commits), commit-to-task links, and
// the state of linked issues and pull requests. Runs every few minutes from
// jobs.ts and on demand ("Sync from GitHub"). Read-only toward GitHub.
import { db } from '../db';
import { gh, ghPaginate, githubAppEnabled, GitHubError } from '../github/app';
import { appRepos, issuesUpdatedSince, orgLogin, rawCommits } from '../github/repos';
import { addGithubMembers } from './people';
import { NON_CODE_TYPES, patchTask } from './tasks';

const DAY_MS = 24 * 60 * 60 * 1000;
// Commits newer than this are linked to tasks.
const LINK_WINDOW_DAYS = 30;
// Default-branch history this deep decides "merged" for linked commits.
const MERGE_WINDOW_DAYS = 180;
// Line counts take a request per commit; only this recent, and this many per run.
const STATS_WINDOW_DAYS = 7;
const STATS_PER_RUN = 60;

export interface SyncResult {
  members_added: number;
  repos_scanned: number;
  repos_unchanged: number;
  commits_seen: number;
  links_added: number;
  links_refreshed: number;
  tasks_completed: number;
  errors: string[];
}

export interface SyncStatus {
  running: boolean;
  last_run_at: string | null;
  last_result: SyncResult | null;
}

let running: Promise<SyncResult> | null = null;
const status: SyncStatus = { running: false, last_run_at: null, last_result: null };

export function syncStatus(): SyncStatus {
  return { ...status, running: Boolean(running) };
}

/**
 * Runs a full sync, or joins the one already running. `force` rescans repos
 * whose last push was already scanned.
 */
export function runSync({ force = false } = {}): Promise<SyncResult> {
  if (!githubAppEnabled) return Promise.resolve(emptyResult(['The GitHub App is not set up']));
  running ??= doSync(force).finally(() => {
    running = null;
  });
  return running;
}

/** Only re-matches commits already collected (after a task is created or renamed). */
export function relinkCommits(): void {
  try {
    linkCommits();
  } catch (err) {
    console.error('[tracker] commit linking failed', err);
  }
}

function emptyResult(errors: string[] = []): SyncResult {
  return { members_added: 0, repos_scanned: 0, repos_unchanged: 0, commits_seen: 0, links_added: 0, links_refreshed: 0, tasks_completed: 0, errors };
}

async function doSync(force: boolean): Promise<SyncResult> {
  const result = emptyResult();
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      result.errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  await step('members', async () => {
    result.members_added = await syncMembers();
  });
  await step('commits', () => syncCommits(force, result));
  await step('commit links', async () => {
    result.links_added = linkCommits();
  });
  await step('issues', () => syncLinks(result));
  await step('line counts', fillCommitStats);
  status.last_run_at = new Date().toISOString();
  status.last_result = result;
  if (result.errors.length) console.error('[tracker] sync:', result.errors.join('; '));
  return result;
}

// ---------------------------------------------------------------------------
// Members

async function syncMembers(): Promise<number> {
  const org = await orgLogin();
  const members = await ghPaginate<{ login: string; type: string }>(`/orgs/${org}/members`);
  const known = new Set(
    (db.prepare('SELECT github_login FROM tracker_members').all() as { github_login: string }[]).map((r) => r.github_login.toLowerCase()),
  );
  const fresh = members.filter((m) => m.type === 'User' && !m.login.endsWith('[bot]') && !known.has(m.login.toLowerCase()));
  const people = await Promise.all(
    fresh.map(async (m) => {
      const profile = await gh<{ name: string | null }>(`/users/${m.login}`).catch(() => null);
      return { login: m.login, name: profile?.name || m.login };
    }),
  );
  return addGithubMembers(people);
}

// ---------------------------------------------------------------------------
// Commits

async function syncCommits(force: boolean, result: SyncResult): Promise<void> {
  const nowMs = Date.now();
  const linkSince = new Date(nowMs - LINK_WINDOW_DAYS * DAY_MS).toISOString();
  const mergeSince = new Date(nowMs - MERGE_WINDOW_DAYS * DAY_MS).toISOString();
  const upsert = db.prepare(
    `INSERT INTO gh_commits (repo, sha, message, author_login, author_name, authored_at, url, on_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (repo, sha) DO UPDATE SET on_default = MAX(on_default, excluded.on_default)`,
  );
  const markMerged = db.prepare('UPDATE gh_commits SET on_default = 1 WHERE repo = ? AND sha = ?');

  for (const repo of await appRepos()) {
    if (repo.archived) continue;
    const last = db.prepare('SELECT pushed_at FROM gh_repo_sync WHERE repo = ?').get(repo.full_name) as { pushed_at: string | null } | undefined;
    // Nothing pushed since the last scan: nothing new to see, and merges are pushes too.
    if (!force && last && last.pushed_at === repo.pushed_at) {
      result.repos_unchanged++;
      continue;
    }
    result.repos_scanned++;

    const main = await rawCommits(repo.full_name, { sha: repo.default_branch, since: mergeSince }, 10);
    const mainShas = new Set(main.map((c) => c.sha));
    const seen = new Map(main.map((c) => [c.sha, c]));
    const branches = await ghPaginate<{ name: string; commit: { sha: string } }>(`/repos/${repo.full_name}/branches`, {}, { maxPages: 5 });
    for (const branch of branches) {
      // Branches whose head is already on the default branch add nothing.
      if (branch.name === repo.default_branch || mainShas.has(branch.commit.sha)) continue;
      for (const c of await rawCommits(repo.full_name, { sha: branch.name, since: linkSince }, 3)) {
        if (!seen.has(c.sha)) seen.set(c.sha, c);
      }
    }

    db.exec('BEGIN');
    try {
      for (const c of seen.values()) {
        const authoredAt = c.commit.author?.date ? new Date(c.commit.author.date).toISOString() : null;
        if (!authoredAt || authoredAt < linkSince) continue;
        if ((c.author?.login ?? c.commit.author?.name ?? '').toLowerCase().includes('[bot]')) continue;
        upsert.run(
          repo.full_name,
          c.sha,
          c.commit.message ?? '',
          c.author?.login ?? null,
          c.commit.author?.name ?? null,
          authoredAt,
          c.html_url,
          mainShas.has(c.sha) ? 1 : 0,
        );
        result.commits_seen++;
      }
      // Commits merged since an earlier run flip to merged.
      for (const sha of mainShas) markMerged.run(repo.full_name, sha);
      db.prepare(
        `INSERT INTO gh_repo_sync (repo, pushed_at, synced_at) VALUES (?, ?, ?)
         ON CONFLICT (repo) DO UPDATE SET pushed_at = excluded.pushed_at, synced_at = excluded.synced_at`,
      ).run(repo.full_name, repo.pushed_at, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  // Old commits nobody links to aren't needed any more.
  db.prepare(
    `DELETE FROM gh_commits WHERE authored_at < ?
       AND NOT EXISTS (SELECT 1 FROM tracker_commits tc WHERE tc.repo = gh_commits.repo AND tc.sha = gh_commits.sha)`,
  ).run(new Date(nowMs - 90 * DAY_MS).toISOString());
}

/** Line counts for recent commits, which need a request each. */
async function fillCommitStats(): Promise<void> {
  const since = new Date(Date.now() - STATS_WINDOW_DAYS * DAY_MS).toISOString();
  const rows = db
    .prepare(`SELECT repo, sha FROM gh_commits WHERE additions IS NULL AND authored_at >= ? ORDER BY authored_at DESC LIMIT ?`)
    .all(since, STATS_PER_RUN) as { repo: string; sha: string }[];
  const update = db.prepare('UPDATE gh_commits SET additions = ?, deletions = ? WHERE repo = ? AND sha = ?');
  for (const { repo, sha } of rows) {
    try {
      const c = await gh<{ stats?: { additions: number; deletions: number } }>(`/repos/${repo}/commits/${sha}`);
      update.run(c.stats?.additions ?? 0, c.stats?.deletions ?? 0, repo, sha);
    } catch (err) {
      // Gone from GitHub (a force-pushed branch): count it as zero rather than retrying forever.
      if (err instanceof GitHubError && (err.status === 404 || err.status === 400)) update.run(0, 0, repo, sha);
      else throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Commit -> task links

const normalize = (s: string) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(' ');

/**
 * Links recent commits to tasks. A commit belongs to a task when its message
 * has the task's ref (T-12), mentions an issue or PR the task is linked to
 * (#34, in that repo), or contains the task's whole title (code tasks only,
 * titles of 6+ characters). Returns the number of new links.
 */
export function linkCommits(): number {
  const since = new Date(Date.now() - LINK_WINDOW_DAYS * DAY_MS).toISOString();
  const tasks = (db.prepare('SELECT id, title, task_type FROM tracker_tasks').all() as { id: number; title: string; task_type: string }[]).map(
    (t) => ({ ...t, norm: NON_CODE_TYPES.has(t.task_type) ? '' : normalize(t.title) }),
  );
  if (tasks.length === 0) return 0;
  const taskIds = new Set(tasks.map((t) => t.id));
  const linkedIssues = new Map<string, number[]>(); // "repo#n" -> task ids
  for (const l of db.prepare('SELECT task_id, repo, number FROM tracker_links').all() as { task_id: number; repo: string; number: number }[]) {
    const key = `${l.repo.toLowerCase()}#${l.number}`;
    linkedIssues.set(key, [...(linkedIssues.get(key) ?? []), l.task_id]);
  }

  const commits = db.prepare('SELECT repo, sha, message FROM gh_commits WHERE authored_at >= ?').all(since) as {
    repo: string;
    sha: string;
    message: string;
  }[];
  const insert = db.prepare('INSERT OR IGNORE INTO tracker_commits (task_id, repo, sha) VALUES (?, ?, ?)');
  let added = 0;
  for (const c of commits) {
    const matches = new Set<number>();
    for (const m of c.message.matchAll(/\bT-(\d+)\b/gi)) if (taskIds.has(Number(m[1]))) matches.add(Number(m[1]));
    for (const m of c.message.matchAll(/(?:^|[^\w&/])#(\d+)\b/g)) {
      for (const id of linkedIssues.get(`${c.repo.toLowerCase()}#${m[1]}`) ?? []) matches.add(id);
    }
    const norm = normalize(c.message);
    for (const t of tasks) if (t.norm.length >= 6 && norm.includes(t.norm)) matches.add(t.id);
    for (const id of matches) added += Number(insert.run(id, c.repo, c.sha).changes);
  }
  return added;
}

// ---------------------------------------------------------------------------
// Linked issues and pull requests

async function syncLinks(result: SyncResult): Promise<void> {
  const repos = db
    .prepare(
      `SELECT l.repo, MIN(COALESCE(l.synced_at, '')) AS since FROM tracker_links l
         JOIN tracker_tasks t ON t.id = l.task_id WHERE t.archived = 0 GROUP BY l.repo`,
    )
    .all() as { repo: string; since: string }[];
  for (const { repo, since } of repos) {
    const at = new Date().toISOString();
    let changed;
    try {
      changed = await issuesUpdatedSince(repo, since || new Date(Date.now() - LINK_WINDOW_DAYS * DAY_MS).toISOString());
    } catch (err) {
      // One repo going away (renamed, App removed) shouldn't stop the rest.
      result.errors.push(`issues in ${repo}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    for (const issue of changed) {
      const links = db
        .prepare(
          `SELECT l.id, l.kind, l.state, l.task_id, t.status FROM tracker_links l JOIN tracker_tasks t ON t.id = l.task_id
            WHERE l.repo = ? AND l.number = ?`,
        )
        .all(repo, issue.number) as { id: number; kind: string; state: string; task_id: number; status: string }[];
      for (const link of links) {
        db.prepare('UPDATE tracker_links SET title = ?, state = ?, merged = ?, synced_at = ? WHERE id = ?').run(
          issue.title,
          issue.state,
          issue.merged ? 1 : 0,
          at,
          link.id,
        );
        result.links_refreshed++;
        // A linked issue closed as completed finishes the task, once: reopening
        // the task by hand afterwards sticks.
        if (link.kind === 'issue' && link.state === 'open' && issue.state === 'closed' && issue.state_reason !== 'not_planned' && link.status !== 'done') {
          patchTask(link.task_id, { status: 'done' });
          result.tasks_completed++;
        }
      }
    }
    db.prepare('UPDATE tracker_links SET synced_at = ? WHERE repo = ?').run(at, repo);
  }
}
