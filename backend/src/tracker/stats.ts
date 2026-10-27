// GitHub activity numbers for the tracker: each member's last 7 days (from
// the commits the sync job collected) and the org's history (from GitHub's
// statistics API, summed over repos).
import { db } from '../db';
import { GitHubError } from '../github/app';
import { appRepos, repoActivity, type ContributorStat, type WeekStat } from '../github/repos';
import { listMembers } from './people';

export interface MemberStats {
  login: string;
  commit_count: number;
  merged_count: number;
  unmerged_count: number;
  additions: number;
  deletions: number;
  merged_additions: number;
  merged_deletions: number;
  unmerged_additions: number;
  unmerged_deletions: number;
  /** Commits whose line counts haven't been fetched yet. */
  pending_line_counts: number;
  repos: string[];
  window_start: string;
}

/** Last-7-days commit stats for every active member, all repos and branches. */
export function memberStats(now = new Date()): MemberStats[] {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare('SELECT repo, author_login, on_default, additions, deletions FROM gh_commits WHERE authored_at >= ? AND author_login IS NOT NULL')
    .all(since) as { repo: string; author_login: string; on_default: number; additions: number | null; deletions: number | null }[];
  return listMembers(true).map((m) => {
    const mine = rows.filter((r) => r.author_login.toLowerCase() === m.github_login.toLowerCase());
    const sum = (list: typeof mine, key: 'additions' | 'deletions') => list.reduce((s, r) => s + (r[key] ?? 0), 0);
    const merged = mine.filter((r) => r.on_default);
    const unmerged = mine.filter((r) => !r.on_default);
    return {
      login: m.github_login,
      commit_count: mine.length,
      merged_count: merged.length,
      unmerged_count: unmerged.length,
      additions: sum(mine, 'additions'),
      deletions: sum(mine, 'deletions'),
      merged_additions: sum(merged, 'additions'),
      merged_deletions: sum(merged, 'deletions'),
      unmerged_additions: sum(unmerged, 'additions'),
      unmerged_deletions: sum(unmerged, 'deletions'),
      pending_line_counts: mine.filter((r) => r.additions === null).length,
      repos: [...new Set(mine.map((r) => r.repo))],
      window_start: since,
    };
  });
}

export interface Overall {
  /** Some repos' statistics are still being computed by GitHub; ask again shortly. */
  computing: string[];
  repos: string[];
  weeks: WeekStat[];
  contributors: ContributorStat[];
}

/** Weekly commits and line counts across the org's repos (or one repo). */
export async function overall(repo?: string): Promise<Overall> {
  const repos = (await appRepos()).filter((r) => !r.archived && !r.fork && (!repo || r.full_name === repo)).map((r) => r.full_name);
  const out: Overall = { computing: [], repos, weeks: [], contributors: [] };
  const weeks = new Map<number, WeekStat>();
  const people = new Map<string, ContributorStat>();
  const addWeek = (into: Map<number, WeekStat>, w: WeekStat) => {
    const slot = into.get(w.week) ?? { week: w.week, commits: 0, additions: 0, deletions: 0 };
    slot.commits += w.commits;
    slot.additions += w.additions;
    slot.deletions += w.deletions;
    into.set(w.week, slot);
  };

  const results = await Promise.all(
    repos.map((name) =>
      repoActivity(name).catch((err) => {
        if (err instanceof GitHubError && err.status === 202) {
          out.computing.push(name);
          return null;
        }
        throw err;
      }),
    ),
  );
  for (const activity of results) {
    if (!activity) continue;
    for (const w of activity.weeks) addWeek(weeks, w);
    for (const c of activity.contributors) {
      const key = c.login.toLowerCase();
      const slot = people.get(key) ?? { login: c.login, avatar_url: c.avatar_url, commits: 0, additions: 0, deletions: 0, weeks: [] };
      slot.commits += c.commits;
      slot.additions += c.additions;
      slot.deletions += c.deletions;
      const byWeek = new Map(slot.weeks.map((w) => [w.week, w]));
      for (const w of c.weeks) addWeek(byWeek, w);
      slot.weeks = [...byWeek.values()].sort((a, b) => a.week - b.week);
      people.set(key, slot);
    }
  }
  out.weeks = [...weeks.values()].sort((a, b) => a.week - b.week);
  out.contributors = [...people.values()].sort((a, b) => b.commits - a.commits);
  return out;
}
