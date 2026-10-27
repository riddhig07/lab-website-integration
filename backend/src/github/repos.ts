// The org's repositories, issues, pull requests and commits, as the portal
// shows them. Reads are cached briefly in memory; GitHub stays the source of
// truth. Only repos the App is installed on are served (assertRepo), so the
// App can't be used to read arbitrary public repos.
import { config } from '../config';
import { gh, ghPaginate, GitHubError } from './app';

const LIST_TTL_MS = 2 * 60 * 1000;
const STATS_TTL_MS = 60 * 60 * 1000;

const cache = new Map<string, { value: unknown; expiresAt: number }>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await load();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** Drops cached reads for a repo (after a write), or everything. */
export function invalidate(repo?: string): void {
  for (const key of cache.keys()) if (!repo || key.includes(repo)) cache.delete(key);
}

// ---------------------------------------------------------------------------
// Shapes sent to the portal (a small subset of GitHub's)

export interface RepoSummary {
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  fork: boolean;
  language: string | null;
  topics: string[];
  default_branch: string;
  pushed_at: string | null;
  stars: number;
  open_issues: number;
  open_prs: number;
  url: string;
}

export interface Label {
  name: string;
  color: string;
}

export interface IssueSummary {
  repo: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  state_reason: string | null;
  is_pr: boolean;
  draft: boolean;
  merged: boolean;
  user: string | null;
  assignees: string[];
  labels: Label[];
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  url: string;
}

export interface IssueDetail extends IssueSummary {
  body: string;
  head: string | null;
  base: string | null;
  comment_list: { id: number; user: string | null; body: string; created_at: string; url: string }[];
}

export interface CommitSummary {
  sha: string;
  message: string;
  author_login: string | null;
  author_name: string | null;
  authored_at: string;
  url: string;
}

export interface CommitDetail extends CommitSummary {
  full_message: string;
  parents: string[];
  stats: { additions: number; deletions: number; total: number };
  files: { filename: string; status: string; additions: number; deletions: number; patch?: string }[];
}

export interface BranchSummary {
  name: string;
  sha: string;
  protected: boolean;
  is_default: boolean;
}

export interface Contributor {
  login: string;
  avatar_url: string;
  contributions: number;
}

export interface WeekStat {
  /** Week start, unix seconds (Sunday 00:00 UTC, as GitHub reports it). */
  week: number;
  commits: number;
  additions: number;
  deletions: number;
}

export interface ContributorStat {
  login: string;
  avatar_url: string | null;
  commits: number;
  additions: number;
  deletions: number;
  weeks: WeekStat[];
}

export interface RepoActivity {
  repo: string;
  weeks: WeekStat[];
  contributors: ContributorStat[];
}

// ---------------------------------------------------------------------------
// GitHub's shapes, as far as they're read here

interface GhRepo {
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  fork: boolean;
  language: string | null;
  topics?: string[];
  default_branch: string;
  pushed_at: string | null;
  stargazers_count: number;
  open_issues_count: number;
  html_url: string;
  owner: { login: string };
}

interface GhUser {
  login: string;
  avatar_url?: string;
}

interface GhIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  state_reason?: string | null;
  draft?: boolean;
  user: GhUser | null;
  assignees?: GhUser[];
  labels: (string | { name?: string; color?: string })[];
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  repository_url: string;
  body?: string | null;
  pull_request?: { merged_at?: string | null };
  merged_at?: string | null;
  head?: { ref: string };
  base?: { ref: string };
}

interface GhCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name?: string; date?: string } | null };
  author: GhUser | null;
  parents?: { sha: string }[];
  stats?: { additions: number; deletions: number; total: number };
  files?: { filename: string; status: string; additions: number; deletions: number; patch?: string }[];
}

// ---------------------------------------------------------------------------
// Repositories

async function installationRepos(): Promise<GhRepo[]> {
  return cached('repos', LIST_TTL_MS, () =>
    ghPaginate<GhRepo>('/installation/repositories', {}, { key: 'repositories' }),
  );
}

/** The org the App is installed on (GITHUB_ORG, else the repos' owner). */
export async function orgLogin(): Promise<string> {
  if (config.github.org) return config.github.org;
  const repos = await installationRepos();
  if (!repos[0]) throw new GitHubError(404, 'The GitHub App has no repositories');
  return repos[0].owner.login;
}

/** Throws 404 unless `fullName` (owner/name) is one of the App's repos; returns GitHub's spelling. */
export async function assertRepo(fullName: string): Promise<GhRepo> {
  const repo = (await installationRepos()).find((r) => r.full_name.toLowerCase() === fullName.toLowerCase());
  if (!repo) throw new GitHubError(404, 'Repository not found');
  return repo;
}

function repoSummary(r: GhRepo, openPrs: number): RepoSummary {
  return {
    name: r.name,
    full_name: r.full_name,
    description: r.description,
    private: r.private,
    archived: r.archived,
    fork: r.fork,
    language: r.language,
    topics: r.topics ?? [],
    default_branch: r.default_branch,
    pushed_at: r.pushed_at,
    stars: r.stargazers_count,
    // GitHub counts open pull requests as issues too.
    open_issues: Math.max(0, r.open_issues_count - openPrs),
    open_prs: openPrs,
    url: r.html_url,
  };
}

/** Open pull requests per repo, from one org-wide search. */
async function openPrCounts(): Promise<Map<string, number>> {
  return cached('open-prs', LIST_TTL_MS, async () => {
    const org = await orgLogin();
    const prs = await ghPaginate<GhIssue>('/search/issues', { q: `org:${org} is:pr is:open` }, { maxPages: 5 });
    const counts = new Map<string, number>();
    for (const pr of prs) {
      const repo = repoFromApiUrl(pr.repository_url);
      counts.set(repo, (counts.get(repo) ?? 0) + 1);
    }
    return counts;
  });
}

export async function listRepos(): Promise<RepoSummary[]> {
  const [repos, prs] = await Promise.all([installationRepos(), openPrCounts()]);
  return repos
    .map((r) => repoSummary(r, prs.get(r.full_name) ?? 0))
    .sort((a, b) => (b.pushed_at ?? '').localeCompare(a.pushed_at ?? ''));
}

export async function getRepo(fullName: string): Promise<RepoSummary> {
  const repo = await assertRepo(fullName);
  const prs = await openPrCounts();
  return repoSummary(repo, prs.get(repo.full_name) ?? 0);
}

// ---------------------------------------------------------------------------
// Issues and pull requests

const repoFromApiUrl = (u: string) => u.replace('https://api.github.com/repos/', '');

function labelOf(l: GhIssue['labels'][number]): Label {
  return typeof l === 'string' ? { name: l, color: '888888' } : { name: l.name ?? '', color: l.color ?? '888888' };
}

function issueSummary(i: GhIssue, repo?: string): IssueSummary {
  const isPr = Boolean(i.pull_request) || Boolean(i.head);
  return {
    repo: repo ?? repoFromApiUrl(i.repository_url),
    number: i.number,
    title: i.title,
    state: i.state,
    state_reason: i.state_reason ?? null,
    is_pr: isPr,
    draft: Boolean(i.draft),
    merged: Boolean(i.merged_at ?? i.pull_request?.merged_at),
    user: i.user?.login ?? null,
    assignees: (i.assignees ?? []).map((a) => a.login),
    labels: i.labels.map(labelOf),
    comments: i.comments ?? 0,
    created_at: i.created_at,
    updated_at: i.updated_at,
    closed_at: i.closed_at,
    url: i.html_url,
  };
}

export type StateFilter = 'open' | 'closed' | 'all';

export async function listIssues(fullName: string, state: StateFilter = 'open'): Promise<IssueSummary[]> {
  const repo = await assertRepo(fullName);
  return cached(`issues:${repo.full_name}:${state}`, LIST_TTL_MS, async () => {
    const items = await ghPaginate<GhIssue>(`/repos/${repo.full_name}/issues`, { state, sort: 'updated' }, { maxPages: 3 });
    return items.filter((i) => !i.pull_request).map((i) => issueSummary(i, repo.full_name));
  });
}

export async function listPulls(fullName: string, state: StateFilter = 'open'): Promise<IssueSummary[]> {
  const repo = await assertRepo(fullName);
  return cached(`pulls:${repo.full_name}:${state}`, LIST_TTL_MS, async () => {
    const items = await ghPaginate<GhIssue>(
      `/repos/${repo.full_name}/pulls`,
      { state, sort: 'updated', direction: 'desc' },
      { maxPages: 3 },
    );
    // /pulls doesn't report a comment count.
    return items.map((i) => issueSummary({ ...i, comments: i.comments ?? 0 }, repo.full_name));
  });
}

/** Issues across every repo in the org, newest activity first. */
export async function searchOrgIssues(options: {
  state?: StateFilter;
  q?: string;
  kind?: 'issue' | 'pr';
}): Promise<IssueSummary[]> {
  const org = await orgLogin();
  const terms = [`org:${org}`, `is:${options.kind ?? 'issue'}`];
  if (options.state && options.state !== 'all') terms.push(`is:${options.state}`);
  // Free text from the user is a search term, never a qualifier list: strip
  // anything that looks like one so it can't widen the search past the org.
  const text = (options.q ?? '').replace(/\b[\w-]+:\S*/g, ' ').trim();
  if (text) terms.push(text);
  const query = terms.join(' ');
  return cached(`search:${query}`, 60_000, async () => {
    const items = await ghPaginate<GhIssue>('/search/issues', { q: query, sort: 'updated', order: 'desc' }, { maxPages: 2 });
    return items.map((i) => issueSummary(i));
  });
}

export async function getIssue(fullName: string, number: number): Promise<IssueDetail> {
  const repo = await assertRepo(fullName);
  const [issue, comments] = await Promise.all([
    gh<GhIssue>(`/repos/${repo.full_name}/issues/${number}`),
    ghPaginate<{ id: number; user: GhUser | null; body?: string; created_at: string; html_url: string }>(
      `/repos/${repo.full_name}/issues/${number}/comments`,
      {},
      { maxPages: 3 },
    ),
  ]);
  // Pull requests are issues too; their merge state and branches live on /pulls.
  const pull = issue.pull_request ? await gh<GhIssue>(`/repos/${repo.full_name}/pulls/${number}`) : null;
  return {
    ...issueSummary({ ...issue, merged_at: pull?.merged_at }, repo.full_name),
    body: issue.body ?? '',
    head: pull?.head?.ref ?? null,
    base: pull?.base?.ref ?? null,
    comment_list: comments.map((c) => ({
      id: c.id,
      user: c.user?.login ?? null,
      body: c.body ?? '',
      created_at: c.created_at,
      url: c.html_url,
    })),
  };
}

/** Light lookup used when linking a task (state, title, url), uncached. */
export async function issueState(fullName: string, number: number): Promise<IssueSummary> {
  const repo = await assertRepo(fullName);
  const issue = await gh<GhIssue>(`/repos/${repo.full_name}/issues/${number}`);
  const pull = issue.pull_request ? await gh<GhIssue>(`/repos/${repo.full_name}/pulls/${number}`) : null;
  return issueSummary({ ...issue, merged_at: pull?.merged_at }, repo.full_name);
}

/** Issues and PRs in a repo updated since `since`, for refreshing linked ones. */
export async function issuesUpdatedSince(fullName: string, since: string): Promise<IssueSummary[]> {
  const repo = await assertRepo(fullName);
  const items = await ghPaginate<GhIssue>(`/repos/${repo.full_name}/issues`, { state: 'all', since }, { maxPages: 5 });
  return items.map((i) => issueSummary(i, repo.full_name));
}

// The App writes as itself ("sherp-lab-intranet[bot]"), so writes say which
// portal member asked for them.
const signature = (login: string) => `\n\n---\n_Posted from the Lab Portal by @${login}._`;

export async function createIssue(
  fullName: string,
  input: { title: string; body: string; assignees?: string[]; labels?: string[] },
  login: string,
): Promise<IssueSummary> {
  const repo = await assertRepo(fullName);
  const post = (assignees?: string[]) =>
    gh<GhIssue>(`/repos/${repo.full_name}/issues`, {
      method: 'POST',
      body: { title: input.title, body: input.body + signature(login), assignees, labels: input.labels },
    });
  let issue: GhIssue;
  try {
    issue = await post(input.assignees);
  } catch (err) {
    // Someone who can't be assigned in this repo shouldn't block the issue.
    if (!(err instanceof GitHubError && err.status === 400 && input.assignees?.length)) throw err;
    issue = await post(undefined);
  }
  invalidate(repo.full_name);
  return issueSummary(issue, repo.full_name);
}

export async function commentOnIssue(fullName: string, number: number, body: string, login: string): Promise<void> {
  const repo = await assertRepo(fullName);
  await gh(`/repos/${repo.full_name}/issues/${number}/comments`, { method: 'POST', body: { body: body + signature(login) } });
  invalidate(repo.full_name);
}

export async function setIssueState(fullName: string, number: number, state: 'open' | 'closed'): Promise<IssueSummary> {
  const repo = await assertRepo(fullName);
  const issue = await gh<GhIssue>(`/repos/${repo.full_name}/issues/${number}`, { method: 'PATCH', body: { state } });
  invalidate(repo.full_name);
  return issueSummary(issue, repo.full_name);
}

// ---------------------------------------------------------------------------
// Commits, branches, contributors

export function commitSummary(c: GhCommit): CommitSummary {
  return {
    sha: c.sha,
    message: (c.commit.message ?? '').split('\n')[0].slice(0, 300),
    author_login: c.author?.login ?? null,
    author_name: c.commit.author?.name ?? null,
    authored_at: c.commit.author?.date ?? '',
    url: c.html_url,
  };
}

export async function listCommits(
  fullName: string,
  options: { sha?: string; since?: string; author?: string; path?: string; maxPages?: number } = {},
): Promise<CommitSummary[]> {
  const repo = await assertRepo(fullName);
  const { maxPages = 1, ...params } = options;
  return cached(`commits:${repo.full_name}:${JSON.stringify(options)}`, LIST_TTL_MS, async () =>
    (await ghPaginate<GhCommit>(`/repos/${repo.full_name}/commits`, params, { maxPages })).map(commitSummary),
  );
}

/** Raw commits (with full messages) for the sync job; uncached. */
export async function rawCommits(fullName: string, params: { sha?: string; since?: string }, maxPages: number): Promise<GhCommit[]> {
  return ghPaginate<GhCommit>(`/repos/${fullName}/commits`, params, { maxPages });
}

export async function getCommit(fullName: string, sha: string): Promise<CommitDetail> {
  const repo = await assertRepo(fullName);
  return cached(`commit:${repo.full_name}:${sha}`, STATS_TTL_MS, async () => {
    const c = await gh<GhCommit>(`/repos/${repo.full_name}/commits/${encodeURIComponent(sha)}`);
    return {
      ...commitSummary(c),
      full_message: c.commit.message ?? '',
      parents: (c.parents ?? []).map((p) => p.sha),
      stats: c.stats ?? { additions: 0, deletions: 0, total: 0 },
      files: (c.files ?? []).map(({ filename, status, additions, deletions, patch }) => ({ filename, status, additions, deletions, patch })),
    };
  });
}

export async function listBranches(fullName: string): Promise<BranchSummary[]> {
  const repo = await assertRepo(fullName);
  return cached(`branches:${repo.full_name}`, LIST_TTL_MS, async () => {
    const branches = await ghPaginate<{ name: string; commit: { sha: string }; protected: boolean }>(
      `/repos/${repo.full_name}/branches`,
      {},
      { maxPages: 5 },
    );
    return branches
      .map((b) => ({ name: b.name, sha: b.commit.sha, protected: b.protected, is_default: b.name === repo.default_branch }))
      .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
  });
}

export async function listContributors(fullName: string): Promise<Contributor[]> {
  const repo = await assertRepo(fullName);
  return cached(`contributors:${repo.full_name}`, STATS_TTL_MS, async () =>
    (await ghPaginate<{ login: string; avatar_url: string; contributions: number; type: string }>(
      `/repos/${repo.full_name}/contributors`,
      {},
      { maxPages: 3 },
    ))
      .filter((c) => c.type === 'User')
      .map(({ login, avatar_url, contributions }) => ({ login, avatar_url, contributions })),
  );
}

/**
 * Weekly commits and line counts, overall and per contributor, from GitHub's
 * statistics API. Throws GitHubError(202) while GitHub is still computing it
 * (the first request after a quiet spell); failures aren't cached.
 */
export async function repoActivity(fullName: string): Promise<RepoActivity> {
  const repo = await assertRepo(fullName);
  return cached(`activity:${repo.full_name}`, STATS_TTL_MS, async () => {
    const raw =
      (await gh<{ author: GhUser | null; total: number; weeks: { w: number; a: number; d: number; c: number }[] }[] | null>(
        `/repos/${repo.full_name}/stats/contributors`,
      )) ?? [];
    const byWeek = new Map<number, WeekStat>();
    const contributors: ContributorStat[] = [];
    for (const c of raw) {
      const weeks = c.weeks.map((w) => ({ week: w.w, commits: w.c, additions: w.a, deletions: w.d }));
      for (const w of weeks) {
        const slot = byWeek.get(w.week) ?? { week: w.week, commits: 0, additions: 0, deletions: 0 };
        slot.commits += w.commits;
        slot.additions += w.additions;
        slot.deletions += w.deletions;
        byWeek.set(w.week, slot);
      }
      if (!c.author || c.author.login.endsWith('[bot]')) continue;
      contributors.push({
        login: c.author.login,
        avatar_url: c.author.avatar_url ?? null,
        commits: c.total,
        additions: weeks.reduce((s, w) => s + w.additions, 0),
        deletions: weeks.reduce((s, w) => s + w.deletions, 0),
        weeks: weeks.filter((w) => w.commits > 0),
      });
    }
    return {
      repo: repo.full_name,
      weeks: [...byWeek.values()].sort((a, b) => a.week - b.week),
      contributors: contributors.sort((a, b) => b.commits - a.commits),
    };
  });
}

/** The App's repos (for the sync job), without the PR counts. */
export async function appRepos(): Promise<GhRepo[]> {
  return installationRepos();
}
