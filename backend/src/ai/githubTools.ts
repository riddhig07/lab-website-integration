// The assistant's GitHub tools: the lab's repos through the GitHub App. Reads
// cover everything the Repositories pages show plus file contents and code
// search; writes are the issue actions members can take in the portal, signed
// with the member's username.
import { githubAppEnabled } from '../github/app';
import {
  commentOnIssue,
  createIssue,
  getCommit,
  getIssue,
  getRepo,
  listBranches,
  listCommits,
  listContributors,
  listIssues,
  listPulls,
  listRepoFiles,
  listRepos,
  readRepoFile,
  searchCode,
  searchOrgIssues,
  setIssueAssignees,
  setIssueState,
} from '../github/repos';
import { actorOf, listMembers } from '../tracker/people';
import { clamp, excerpt, formatBytes, list, plural, str, VIEW_ROWS, type FileType, type Handler, type ToolDeclaration, type ToolModule, type ToolResult, type ToolView } from './toolkit';

const REPO = { type: 'string', description: 'owner/name, e.g. S-H-E-R-P-AI-Lab/ugv_rover.' };
const NUMBER = { type: 'integer', description: 'Issue or pull request number.' };
const REF = { type: 'string', description: 'Branch, tag or commit sha. Default branch if omitted.' };

const declarations: ToolDeclaration[] = [
  {
    name: 'list_repos',
    description: "The lab's GitHub repositories with description, language, default branch, open issue and PR counts, and last push.",
  },
  {
    name: 'get_repo',
    description: 'One repo: description, topics, default branch, counts, plus its branches and top contributors.',
    parameters: { type: 'object', properties: { repo: REPO }, required: ['repo'] },
  },
  {
    name: 'list_issues',
    description: 'GitHub issues (or pull requests) in one repo, or across every lab repo when repo is omitted.',
    parameters: {
      type: 'object',
      properties: {
        repo: { ...REPO, description: 'owner/name. Omit to search the whole org.' },
        kind: { type: 'string', enum: ['issue', 'pr'], description: 'Default issue.' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Default open.' },
        query: { type: 'string', description: 'Text to search for (org-wide search only).' },
      },
    },
  },
  {
    name: 'get_issue',
    description: 'One issue or pull request in full: body, labels, assignees, state, branches (PRs), and its comments.',
    parameters: { type: 'object', properties: { repo: REPO, number: NUMBER }, required: ['repo', 'number'] },
  },
  {
    name: 'list_commits',
    description: 'Commits in a lab repo, newest first: sha, message (first line), author, date, url. Filter by branch, author, path, time window or message text. Use get_commit for the diff.',
    parameters: {
      type: 'object',
      properties: {
        repo: REPO,
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
        repo: REPO,
        sha: { type: 'string', description: 'Full or abbreviated sha (7+ characters).' },
        include_patch: { type: 'boolean', description: 'Include diffs (default true).' },
        path: { type: 'string', description: 'Only files whose path starts with this.' },
      },
      required: ['repo', 'sha'],
    },
  },
  {
    name: 'list_branches',
    description: "A repo's branches with their head sha, which one is the default, and which are protected.",
    parameters: { type: 'object', properties: { repo: REPO }, required: ['repo'] },
  },
  {
    name: 'list_contributors',
    description: "A repo's contributors by number of commits, all time.",
    parameters: { type: 'object', properties: { repo: REPO }, required: ['repo'] },
  },
  {
    name: 'list_repo_files',
    description: 'Files and folders in a repo directory (root by default). recursive=true lists the whole tree under it, for getting a picture of a codebase.',
    parameters: {
      type: 'object',
      properties: { repo: REPO, path: { type: 'string', description: 'Directory; omit for the root.' }, ref: REF, recursive: { type: 'boolean' } },
      required: ['repo'],
    },
  },
  {
    name: 'read_repo_file',
    description: 'The text of a file in a repo (README, source, config, docs). Long files are cut at max_chars; read a later part with offset.',
    parameters: {
      type: 'object',
      properties: {
        repo: REPO,
        path: { type: 'string' },
        ref: REF,
        offset: { type: 'integer', description: 'Character to start from (default 0).' },
        max_chars: { type: 'integer', description: '1000-100000, default 40000.' },
      },
      required: ['repo', 'path'],
    },
  },
  {
    name: 'search_code',
    description:
      "Search the code and text files of the lab's repos (default branches) like grep: every matching line with its file, line number and link, plus files whose path matches. Case-insensitive; set regex=true for a regular expression. Read the file for more context.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        repo: { ...REPO, description: 'owner/name. Omit for every lab repo.' },
        regex: { type: 'boolean' },
        path: { type: 'string', description: 'Only files under this directory.' },
        limit: { type: 'integer', description: 'Matching lines to return, 1-200 (default 50).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'comment_on_issue',
    description: 'Post a comment on a GitHub issue or pull request, signed with the member\'s username. Visible to the whole lab on GitHub: only when the member asks you to post, and in their words.',
    parameters: { type: 'object', properties: { repo: REPO, number: NUMBER, body: { type: 'string', description: 'Markdown.' } }, required: ['repo', 'number', 'body'] },
  },
  {
    name: 'set_issue_state',
    description: 'Close or reopen a GitHub issue or pull request. Closing an issue linked to a task marks that task done at the next sync. Only when the member asks.',
    parameters: { type: 'object', properties: { repo: REPO, number: NUMBER, state: { type: 'string', enum: ['open', 'closed'] } }, required: ['repo', 'number', 'state'] },
  },
  {
    name: 'set_issue_assignees',
    description:
      "Assign a GitHub issue or pull request to lab members' own GitHub accounts, or take them off it. People can be given by name or GitHub login (names are matched against the team list); they are assigned under their GitHub login. mode: add (default) keeps the current assignees, remove takes the listed people off, set replaces everyone. The result lists anyone GitHub refused (typically someone without access to that repo). Only when the member asks. GitHub notifies the assignee.",
    parameters: {
      type: 'object',
      properties: {
        repo: REPO,
        number: NUMBER,
        assignees: { type: 'array', items: { type: 'string' }, description: 'Names or GitHub logins. With mode set, an empty list unassigns everyone.' },
        mode: { type: 'string', enum: ['add', 'remove', 'set'], description: 'Default add.' },
      },
      required: ['repo', 'number', 'assignees'],
    },
  },
  {
    name: 'create_issue',
    description: 'Open a new GitHub issue in a lab repo, signed with the member\'s username. Use create_issue_from_task instead when it should be tracked as a task. Only when the member asks.',
    parameters: {
      type: 'object',
      properties: {
        repo: REPO,
        title: { type: 'string' },
        body: { type: 'string', description: 'Markdown.' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'Team members by name or GitHub login.' },
        labels: { type: 'array', items: { type: 'string' } },
      },
      required: ['repo', 'title'],
    },
  },
];

const strings = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : undefined);

/**
 * Team members' GitHub logins for whatever the member typed: a login (with or
 * without @), a full name, or an unambiguous first name / part of a name. A
 * login-shaped word that matches no member is passed through as a login, since
 * GitHub knows collaborators the team list may not.
 */
function resolveLogins(inputs: string[]): { logins: string[]; problems: string[] } {
  const members = listMembers(true);
  const logins: string[] = [];
  const problems: string[] = [];
  for (const raw of inputs) {
    const token = raw.trim().replace(/^@/, '');
    if (!token) continue;
    const lower = token.toLowerCase();
    const exact = members.filter((m) => m.github_login.toLowerCase() === lower || m.name.toLowerCase() === lower);
    const partial = exact.length ? exact : members.filter((m) => m.name.toLowerCase().split(/\s+/).includes(lower) || m.name.toLowerCase().includes(lower));
    if (partial.length === 1) logins.push(partial[0].github_login);
    else if (partial.length > 1) problems.push(`"${raw}" could be ${partial.map((m) => `${m.name} (@${m.github_login})`).join(' or ')}`);
    else if (/^[A-Za-z0-9-]+$/.test(token)) logins.push(token);
    else problems.push(`No team member matches "${raw}"`);
  }
  return { logins: [...new Set(logins)], problems };
}

const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const enabled =
  (handler: Handler): Handler =>
  (args, ctx) =>
    githubAppEnabled ? handler(args, ctx) : { error: 'The GitHub App is not set up' };

const handlers: Record<string, Handler> = {
  list_repos: async () => ({ repos: await listRepos() }),

  get_repo: async (args) => {
    const repo = String(args.repo);
    const [summary, branches, contributors] = await Promise.all([getRepo(repo), listBranches(repo), listContributors(repo)]);
    return { repo: summary, branches: branches.slice(0, 50), top_contributors: contributors.slice(0, 10).map(({ login, contributions }) => ({ login, contributions })) };
  },

  list_issues: async (args) => {
    const state = (['open', 'closed', 'all'].includes(String(args.state)) ? args.state : 'open') as 'open' | 'closed' | 'all';
    const kind = args.kind === 'pr' ? 'pr' : 'issue';
    const repo = str(args.repo);
    const items = repo
      ? await (kind === 'pr' ? listPulls(repo, state) : listIssues(repo, state))
      : await searchOrgIssues({ state, kind, q: str(args.query) });
    return { total: items.length, items: items.slice(0, 50) };
  },

  get_issue: async (args) => {
    const issue = await getIssue(String(args.repo), Number(args.number));
    return {
      issue: {
        ...issue,
        body: issue.body.slice(0, 20_000),
        comment_list: issue.comment_list.slice(-30).map((c) => ({ ...c, body: c.body.slice(0, 4000) })),
      },
    };
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

  list_branches: async (args) => {
    const branches = await listBranches(String(args.repo));
    return { total: branches.length, branches: branches.slice(0, 100) };
  },

  list_contributors: async (args) => {
    const contributors = await listContributors(String(args.repo));
    return { contributors: contributors.slice(0, 50).map(({ login, contributions }) => ({ login, contributions })) };
  },

  list_repo_files: async (args) => {
    const { ref, entries, truncated } = await listRepoFiles(String(args.repo), { path: str(args.path), ref: str(args.ref), recursive: args.recursive === true });
    return { repo: args.repo, path: str(args.path) ?? '', ref, total: entries.length, truncated: truncated || entries.length > 500, entries: entries.slice(0, 500) };
  },

  read_repo_file: async (args) => {
    const file = await readRepoFile(String(args.repo), String(args.path), str(args.ref));
    if (file.binary) return { ...file, text: undefined, note: 'Binary file; not shown.' };
    const offset = clamp(args.offset, 0, 0, file.text.length);
    const max = clamp(args.max_chars, 40_000, 1000, 100_000);
    const text = file.text.slice(offset, offset + max);
    return { ...file, repo: args.repo, chars: file.text.length, offset, text, truncated: offset + text.length < file.text.length };
  },

  search_code: async (args) => {
    const query = str(args.query);
    if (!query) return { error: 'A query is required' };
    return { query, ...(await searchCode(query, { repo: str(args.repo), regex: args.regex === true, path: str(args.path), limit: clamp(args.limit, 50, 1, 200) })) };
  },

  comment_on_issue: async (args, ctx) => {
    const body = String(args.body ?? '').trim();
    if (!body || body.length > 10_000) return { error: 'A comment is required (up to 10,000 characters)' };
    await commentOnIssue(String(args.repo), Number(args.number), body, actorOf(ctx.user));
    const issue = await getIssue(String(args.repo), Number(args.number));
    ctx.actions.push({ op: 'github', detail: `commented on ${issue.repo}#${issue.number}` });
    return { commented_on: `${issue.repo}#${issue.number}`, title: issue.title, url: issue.url, comments: issue.comments };
  },

  set_issue_state: async (args, ctx) => {
    const state = args.state === 'open' ? 'open' : args.state === 'closed' ? 'closed' : null;
    if (!state) return { error: 'state must be "open" or "closed"' };
    const issue = await setIssueState(String(args.repo), Number(args.number), state);
    ctx.actions.push({ op: 'github', detail: `${state === 'closed' ? 'closed' : 'reopened'} ${issue.repo}#${issue.number}` });
    return { issue };
  },

  create_issue: async (args, ctx) => {
    const title = String(args.title ?? '').trim();
    if (!title) return { error: 'A title is required' };
    const { logins, problems } = resolveLogins(strings(args.assignees) ?? []);
    if (problems.length) return { error: `Not opened. ${problems.join('; ')}` };
    const issue = await createIssue(String(args.repo), { title: title.slice(0, 256), body: String(args.body ?? ''), assignees: logins, labels: strings(args.labels) }, actorOf(ctx.user));
    ctx.actions.push({ op: 'github', detail: `opened ${issue.repo}#${issue.number}` });
    const notAssigned = logins.filter((l) => !issue.assignees.some((a) => sameLogin(a, l)));
    return { issue, ...(notAssigned.length ? { not_assigned: notAssigned, note: `GitHub did not assign ${notAssigned.join(', ')}: they probably have no access to this repo.` } : {}) };
  },

  set_issue_assignees: async (args, ctx) => {
    const mode = args.mode === 'remove' ? 'remove' : args.mode === 'set' ? 'set' : 'add';
    const { logins, problems } = resolveLogins(strings(args.assignees) ?? []);
    if (problems.length) return { error: `Nothing changed. ${problems.join('; ')}` };
    if (!logins.length && mode !== 'set') return { error: 'Name at least one person to assign' };
    const issue = await setIssueAssignees(String(args.repo), Number(args.number), { [mode]: logins });
    const refused = mode === 'remove' ? logins.filter((l) => issue.assignees.some((a) => sameLogin(a, l))) : logins.filter((l) => !issue.assignees.some((a) => sameLogin(a, l)));
    ctx.actions.push({ op: 'github', detail: `${mode === 'remove' ? 'unassigned' : 'assigned'} ${logins.map((l) => `@${l}`).join(', ') || 'no one'} on ${issue.repo}#${issue.number}` });
    return {
      issue,
      assignees_now: issue.assignees,
      ...(refused.length ? { not_changed: refused, note: `GitHub did not ${mode === 'remove' ? 'unassign' : 'assign'} ${refused.join(', ')}${mode === 'remove' ? '' : ': they probably have no access to this repo'}.` } : {}),
    };
  },
};

for (const name of Object.keys(handlers)) handlers[name] = enabled(handlers[name]);

function summarize(name: string, r: ToolResult): string | undefined {
  const len = (k: string) => list(r, k).length;
  switch (name) {
    case 'list_repos':
      return plural(len('repos'), 'repo');
    case 'get_repo':
      return `${(r.repo as { full_name: string }).full_name} · ${plural(len('branches'), 'branch', 'branches')}`;
    case 'list_issues':
      return plural(Number(r.total), 'item');
    case 'get_issue': {
      const i = r.issue as { repo: string; number: number; comments: number };
      return `${i.repo.split('/')[1]}#${i.number} · ${plural(i.comments, 'comment')}`;
    }
    case 'list_commits':
      return `${len('commits')} of ${plural(Number(r.total_matched), 'commit')}`;
    case 'get_commit':
      return `${String(r.sha).slice(0, 7)} · ${plural(Number(r.files_changed), 'file')}`;
    case 'list_branches':
      return plural(Number(r.total), 'branch', 'branches');
    case 'list_contributors':
      return plural(len('contributors'), 'contributor');
    case 'list_repo_files':
      return plural(Number(r.total), 'entry', 'entries');
    case 'read_repo_file':
      return r.binary ? 'binary file' : `${Number(r.chars).toLocaleString()} characters${r.truncated ? ' (part)' : ''}`;
    case 'search_code':
      return `${plural(Number(r.total), 'match', 'matches')} in ${plural(Number(r.files), 'file')}`;
    case 'comment_on_issue':
      return `commented on ${r.commented_on}`;
    case 'set_issue_state': {
      const i = r.issue as { repo: string; number: number; state: string };
      return `${i.state === 'closed' ? 'closed' : 'reopened'} ${i.repo.split('/')[1]}#${i.number}`;
    }
    case 'create_issue': {
      const i = r.issue as { repo: string; number: number };
      return `opened ${i.repo.split('/')[1]}#${i.number}`;
    }
    case 'set_issue_assignees': {
      const i = r.issue as { repo: string; number: number; assignees: string[] };
      return `${i.repo.split('/')[1]}#${i.number} → ${i.assignees.length ? i.assignees.map((a) => `@${a}`).join(', ') : 'unassigned'}`;
    }
    default:
      return undefined;
  }
}

type IssueRow = { repo: string; number: number; title: string; state: string; merged: boolean; user: string | null; url: string; comments?: number };
const issueRow = (x: IssueRow) => ({
  key: `${x.repo.split('/')[1] ?? x.repo}#${x.number}`,
  title: x.title,
  meta: x.user ? `@${x.user}` : '',
  state: x.merged ? 'merged' : x.state,
  url: x.url,
});

const EXT_TYPES: [RegExp, FileType][] = [
  [/\.(png|jpe?g|gif|webp|svg)$/i, 'image'],
  [/\.pdf$/i, 'pdf'],
  [/\.(csv|tsv|xlsx?)$/i, 'sheet'],
  [/\.(md|txt|rst|tex|docx?)$/i, 'doc'],
];
const fileType = (path: string): FileType => EXT_TYPES.find(([re]) => re.test(path))?.[1] ?? 'code';

function view(name: string, r: ToolResult): ToolView | null | undefined {
  switch (name) {
    case 'list_repos': {
      const repos = list<{ full_name: string; description: string | null; language: string | null; open_issues: number; open_prs: number; url: string }>(r, 'repos');
      return {
        kind: 'rows',
        total: repos.length,
        items: repos.slice(0, VIEW_ROWS).map((x) => ({
          key: x.full_name.split('/')[1] ?? x.full_name,
          title: x.description ?? '',
          meta: [x.language, plural(x.open_issues, 'issue'), plural(x.open_prs, 'PR')].filter(Boolean).join(' · '),
          url: x.url,
        })),
      };
    }
    case 'get_repo': {
      const repo = r.repo as { full_name: string; description: string | null; default_branch: string; language: string | null; open_issues: number; open_prs: number; url: string };
      const top = list<{ login: string; contributions: number }>(r, 'top_contributors');
      return {
        kind: 'doc',
        title: repo.full_name,
        subtitle: [repo.language, `default ${repo.default_branch}`, plural(repo.open_issues, 'open issue'), plural(repo.open_prs, 'open PR')].filter(Boolean).join(' · '),
        excerpt: [repo.description ?? '', top.length ? `Top contributors: ${top.map((c) => `${c.login} (${c.contributions})`).join(', ')}` : ''].filter(Boolean).join('\n\n'),
        url: repo.url,
      };
    }
    case 'list_issues':
      return { kind: 'rows', total: Number(r.total ?? 0), items: list<IssueRow>(r, 'items').slice(0, VIEW_ROWS).map(issueRow) };
    case 'get_issue': {
      const i = r.issue as IssueRow & { body: string; labels: { name: string }[]; is_pr: boolean };
      return {
        kind: 'doc',
        title: `${i.repo.split('/')[1]}#${i.number} ${i.title}`,
        subtitle: [i.user ? `@${i.user}` : '', plural(i.comments ?? 0, 'comment'), ...i.labels.map((l) => l.name)].filter(Boolean).join(' · '),
        excerpt: excerpt(i.body || '(no description)'),
        url: i.url,
        badge: i.merged ? 'merged' : i.state,
      };
    }
    case 'set_issue_state':
    case 'set_issue_assignees':
    case 'create_issue': {
      const i = r.issue as IssueRow;
      return { kind: 'rows', total: 1, items: [issueRow(i)] };
    }
    case 'comment_on_issue':
      return { kind: 'rows', total: 1, items: [{ key: String(r.commented_on).split('/')[1] ?? String(r.commented_on), title: String(r.title), meta: plural(Number(r.comments), 'comment'), url: String(r.url) }] };
    case 'list_commits':
      return {
        kind: 'rows',
        total: Number(r.total_matched ?? 0),
        items: list<{ sha: string; message: string; author_login: string | null; author_name: string | null; authored_at: string; url: string }>(r, 'commits')
          .slice(0, VIEW_ROWS)
          .map((c) => ({ key: c.sha.slice(0, 7), title: c.message.split('\n')[0], meta: `${c.author_login ?? c.author_name ?? 'unknown'} · ${c.authored_at.slice(0, 10)}`, url: c.url })),
      };
    case 'get_commit': {
      const stats = r.stats as { additions: number; deletions: number } | undefined;
      return {
        kind: 'commit',
        sha: String(r.sha).slice(0, 7),
        message: String(r.message ?? '').split('\n')[0],
        additions: stats?.additions ?? 0,
        deletions: stats?.deletions ?? 0,
        files: list<{ filename: string; additions: number; deletions: number }>(r, 'files')
          .slice(0, VIEW_ROWS)
          .map((f) => ({ name: f.filename, additions: f.additions, deletions: f.deletions })),
      };
    }
    case 'list_branches': {
      const branches = list<{ name: string; sha: string; is_default: boolean; protected: boolean }>(r, 'branches');
      return {
        kind: 'rows',
        total: Number(r.total ?? branches.length),
        items: branches.slice(0, VIEW_ROWS).map((b) => ({ key: b.sha.slice(0, 7), title: b.name, meta: [b.is_default && 'default', b.protected && 'protected'].filter(Boolean).join(' · ') })),
      };
    }
    case 'list_contributors':
      return {
        kind: 'bars',
        unit: 'commits, all time',
        legend: ['commits', ''],
        items: list<{ login: string; contributions: number }>(r, 'contributors')
          .slice(0, VIEW_ROWS)
          .map((c) => ({ label: c.login, value: c.contributions, secondary: 0 })),
      };
    case 'list_repo_files': {
      const entries = list<{ path: string; type: string; size: number | null; url: string | null }>(r, 'entries');
      return {
        kind: 'files',
        path: `${String(r.repo).split('/')[1]}/${r.path ?? ''}`.replace(/\/$/, ''),
        total: Number(r.total ?? entries.length),
        items: entries.slice(0, VIEW_ROWS * 2).map((e) => ({
          name: e.path,
          type: e.type === 'dir' ? 'folder' : fileType(e.path),
          meta: e.size !== null ? formatBytes(e.size) : '',
          url: e.url ?? undefined,
        })),
      };
    }
    case 'read_repo_file':
      return {
        kind: 'doc',
        title: String(r.path),
        subtitle: `${String(r.repo).split('/')[1]} · ${r.ref}${r.binary ? ' · binary' : ` · ${Number(r.chars).toLocaleString()} characters`}`,
        excerpt: r.binary ? '' : excerpt(String(r.text ?? ''), 400),
        url: (r.url as string | null) ?? undefined,
      };
    case 'search_code': {
      const items = list<{ repo: string; path: string; line: number; text: string; url: string }>(r, 'items');
      return {
        kind: 'rows',
        total: Number(r.total ?? items.length),
        items: items.slice(0, VIEW_ROWS).map((i) => ({ key: `${i.path.split('/').at(-1)}:${i.line}`, title: i.text, meta: `${i.repo.split('/')[1]}/${i.path}`, url: i.url })),
      };
    }
    default:
      return undefined;
  }
}

export const githubTools: ToolModule = { declarations, handlers, summarize, view };
