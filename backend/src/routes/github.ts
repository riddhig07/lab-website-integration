import { Router, type ErrorRequestHandler, type Request } from 'express';
import { githubAppEnabled, GitHubError } from '../github/app';
import {
  commentOnIssue,
  getCommit,
  getIssue,
  getRepo,
  listBranches,
  listCommits,
  listContributors,
  listIssues,
  listPulls,
  listRepos,
  repoActivity,
  searchOrgIssues,
  setIssueState,
  type StateFilter,
} from '../github/repos';
import { actorOf } from '../tracker/people';

// The org's repositories through the lab's GitHub App, for signed-in members
// (mounted under /api/internal, which requires a session).
export const githubRouter = Router();

githubRouter.use((_req, res, next) => {
  if (!githubAppEnabled) {
    res.status(503).json({ error: 'The GitHub App is not set up (GITHUB_APP_ID / GITHUB_APP_INSTALLATION_ID / GITHUB_APP_PRIVATE_KEY).' });
    return;
  }
  next();
});

const repoName = (req: Request) => `${req.params.owner}/${req.params.name}`;

function stateParam(value: unknown): StateFilter {
  return value === 'closed' || value === 'all' ? value : 'open';
}

function numberParam(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new GitHubError(400, 'Invalid number');
  return n;
}

githubRouter.get('/repos', async (_req, res) => {
  res.json(await listRepos());
});

/** Issues (or pull requests, with kind=pr) across the whole org. */
githubRouter.get('/issues', async (req, res) => {
  res.json(
    await searchOrgIssues({
      state: stateParam(req.query.state),
      q: typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : undefined,
      kind: req.query.kind === 'pr' ? 'pr' : 'issue',
    }),
  );
});

githubRouter.get('/repos/:owner/:name', async (req, res) => {
  res.json(await getRepo(repoName(req)));
});

githubRouter.get('/repos/:owner/:name/issues', async (req, res) => {
  res.json(await listIssues(repoName(req), stateParam(req.query.state)));
});

githubRouter.get('/repos/:owner/:name/issues/:number', async (req, res) => {
  res.json(await getIssue(repoName(req), numberParam(req.params.number)));
});

githubRouter.post('/repos/:owner/:name/issues/:number/comments', async (req, res) => {
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 10_000) {
    res.status(400).json({ error: 'A comment is required (up to 10,000 characters)' });
    return;
  }
  const number = numberParam(req.params.number);
  await commentOnIssue(repoName(req), number, body, actorOf(res.locals.user!));
  res.status(201).json(await getIssue(repoName(req), number));
});

githubRouter.post('/repos/:owner/:name/issues/:number/state', async (req, res) => {
  const state = req.body?.state;
  if (state !== 'open' && state !== 'closed') {
    res.status(400).json({ error: 'state must be "open" or "closed"' });
    return;
  }
  const number = numberParam(req.params.number);
  await setIssueState(repoName(req), number, state);
  res.json(await getIssue(repoName(req), number));
});

githubRouter.get('/repos/:owner/:name/pulls', async (req, res) => {
  res.json(await listPulls(repoName(req), stateParam(req.query.state)));
});

githubRouter.get('/repos/:owner/:name/commits', async (req, res) => {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  res.json(
    await listCommits(repoName(req), {
      sha: str(req.query.branch),
      author: str(req.query.author),
      path: str(req.query.path),
      since: str(req.query.since),
    }),
  );
});

githubRouter.get('/repos/:owner/:name/commits/:sha', async (req, res) => {
  res.json(await getCommit(repoName(req), req.params.sha));
});

githubRouter.get('/repos/:owner/:name/branches', async (req, res) => {
  res.json(await listBranches(repoName(req)));
});

githubRouter.get('/repos/:owner/:name/contributors', async (req, res) => {
  res.json(await listContributors(repoName(req)));
});

githubRouter.get('/repos/:owner/:name/activity', async (req, res) => {
  res.json(await repoActivity(repoName(req)));
});

export const githubErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if (!(err instanceof GitHubError)) return next(err);
  // GitHub is still computing statistics; the portal retries.
  if (err.status === 202) {
    res.status(202).json({ computing: true });
    return;
  }
  if (err.status >= 500) console.error('[github]', err.message);
  res.status(err.status).json({ error: err.message });
};
githubRouter.use(githubErrors);
