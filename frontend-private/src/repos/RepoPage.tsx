import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api } from '../api';
import { DivergingBars, formatNumber, LineChart, weekLabel } from '../charts';
import { timeAgo } from '../format';
import type { BranchSummary, CommitSummary, Contributor, IssueSummary, RepoActivity, RepoSummary } from '../types';
import { IssueTable, StateSelect, withTaskRefs } from './shared';

const TABS = ['issues', 'pulls', 'commits', 'branches', 'contributors', 'activity'] as const;
type TabKey = (typeof TABS)[number];

/**
 * Loads `path` and keeps the latest result; responses to an outdated path are
 * dropped, so switching tabs or filters quickly never shows stale data.
 */
function useFetch<T>(path: string | null): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null }>({ path: null, data: null, error: null });
  useEffect(() => {
    if (!path) return;
    let current = true;
    api<T>(path)
      .then((data) => current && setState({ path, data, error: null }))
      .catch((e: Error) => current && setState({ path, data: null, error: e.message }));
    return () => {
      current = false;
    };
  }, [path]);
  return state.path === path ? { data: state.data, error: state.error } : { data: null, error: null };
}

/** /repos/:owner/:name: one repository's issues, pull requests, commits and activity. */
export function RepoPage() {
  const { owner = '', name = '' } = useParams();
  const fullName = `${owner}/${name}`;
  const base = `/internal/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const [params, setParams] = useSearchParams();
  const tab: TabKey = TABS.includes(params.get('tab') as TabKey) ? (params.get('tab') as TabKey) : 'issues';
  const { data: repo, error } = useFetch<RepoSummary>(base);

  const labels: Record<TabKey, string> = {
    issues: `Issues${repo ? ` (${repo.open_issues})` : ''}`,
    pulls: `Pull requests${repo ? ` (${repo.open_prs})` : ''}`,
    commits: 'Commits',
    branches: 'Branches',
    contributors: 'Contributors',
    activity: 'Activity',
  };

  return (
    <>
      <nav className="breadcrumbs small" aria-label="Breadcrumb">
        <Link to="/repos">Repositories</Link> <span className="muted">/</span> {name}
      </nav>
      <div className="page-header">
        <div>
          <h1>{name}</h1>
          {repo?.description && <p className="muted">{repo.description}</p>}
          {repo && (
            <div className="badges repo-meta">
              {repo.language && <span className="badge info">{repo.language}</span>}
              {repo.private && <span className="badge">Private</span>}
              {repo.archived && <span className="badge warn">Archived</span>}
              <span className="badge">default: {repo.default_branch}</span>
              <span className="muted small">pushed {timeAgo(repo.pushed_at)}</span>
            </div>
          )}
        </div>
        {repo && (
          <a className="button secondary" href={repo.url} target="_blank" rel="noreferrer">
            Open on GitHub ↗
          </a>
        )}
      </div>
      {error && <p className="error">{error}</p>}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParams(t === 'issues' ? {} : { tab: t }, { replace: true })}
          >
            {labels[t]}
          </button>
        ))}
      </div>

      {(tab === 'issues' || tab === 'pulls') && <IssuesTab key={tab} base={base} kind={tab} />}
      {tab === 'commits' && <CommitsTab base={base} defaultBranch={repo?.default_branch} />}
      {tab === 'branches' && <BranchesTab base={base} repoUrl={repo?.url} />}
      {tab === 'contributors' && <ContributorsTab base={base} />}
      {tab === 'activity' && <ActivityTab key={fullName} base={base} />}
    </>
  );
}

function Status({ error, loading, empty, emptyText }: { error: string | null; loading: boolean; empty: boolean; emptyText: string }) {
  if (error) return <p className="error">{error}</p>;
  if (loading) return <p className="muted">Loading…</p>;
  if (empty) return <p className="muted">{emptyText}</p>;
  return null;
}

function IssuesTab({ base, kind }: { base: string; kind: 'issues' | 'pulls' }) {
  const [state, setState] = useState<'open' | 'closed' | 'all'>('open');
  const { data, error } = useFetch<IssueSummary[]>(`${base}/${kind}?state=${state}`);
  const noun = kind === 'pulls' ? 'pull requests' : 'issues';
  return (
    <>
      <div className="toolbar">
        <StateSelect value={state} onChange={setState} />
      </div>
      <Status error={error} loading={!data && !error} empty={data?.length === 0} emptyText={`No ${state === 'all' ? '' : `${state} `}${noun}.`} />
      {data && data.length > 0 && <IssueTable items={data} />}
    </>
  );
}

function CommitsTab({ base, defaultBranch }: { base: string; defaultBranch: string | undefined }) {
  const { data: branches } = useFetch<BranchSummary[]>(`${base}/branches`);
  const [branch, setBranch] = useState('');
  const selected = branch || defaultBranch || '';
  const { data: commits, error } = useFetch<CommitSummary[]>(selected ? `${base}/commits?branch=${encodeURIComponent(selected)}` : null);

  return (
    <>
      <div className="toolbar">
        <select aria-label="Branch" value={selected} onChange={(e) => setBranch(e.target.value)}>
          {!branches && selected && <option value={selected}>{selected}</option>}
          {branches?.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
              {b.is_default ? ' (default)' : ''}
            </option>
          ))}
        </select>
        <span className="muted small">Mention a task's ref (e.g. T-12) in a commit message to link it on the task board.</span>
      </div>
      <Status error={error} loading={!commits && !error} empty={commits?.length === 0} emptyText="No commits on this branch." />
      {commits && commits.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Commit</th>
                <th>Message</th>
                <th>Author</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {commits.map((c) => (
                <tr key={c.sha}>
                  <td>
                    <a className="mono" href={c.url} target="_blank" rel="noreferrer">
                      {c.sha.slice(0, 7)}
                    </a>
                  </td>
                  <td className="repo-commit-message">{withTaskRefs(c.message)}</td>
                  <td className="muted">{c.author_login ? `@${c.author_login}` : (c.author_name ?? '—')}</td>
                  <td className="muted" title={c.authored_at ? new Date(c.authored_at).toLocaleString() : undefined}>
                    {timeAgo(c.authored_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BranchesTab({ base, repoUrl }: { base: string; repoUrl: string | undefined }) {
  const { data, error } = useFetch<BranchSummary[]>(`${base}/branches`);
  const defaultBranch = data?.find((b) => b.is_default)?.name;
  return (
    <>
      <Status error={error} loading={!data && !error} empty={data?.length === 0} emptyText="No branches." />
      {data && data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Head</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.name}>
                  <td>
                    <span className="repo-branch">{b.name}</span>{' '}
                    <span className="badges">
                      {b.is_default && <span className="badge info">Default</span>}
                      {b.protected && <span className="badge">Protected</span>}
                    </span>
                  </td>
                  <td className="mono muted">{b.sha.slice(0, 7)}</td>
                  <td className="row-actions">
                    {repoUrl && !b.is_default && defaultBranch && (
                      <a
                        className="link"
                        href={`${repoUrl}/compare/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(b.name)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Compare ↗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ContributorsTab({ base }: { base: string }) {
  const { data, error } = useFetch<Contributor[]>(`${base}/contributors`);
  return (
    <>
      <Status error={error} loading={!data && !error} empty={data?.length === 0} emptyText="No contributors yet." />
      {data && data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contributor</th>
                <th>Commits</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.login}>
                  <td>
                    <span className="repo-person">
                      <span className="avatar small">
                        <img src={c.avatar_url} alt="" width={24} height={24} loading="lazy" />
                      </span>
                      <a href={`https://github.com/${c.login}`} target="_blank" rel="noreferrer">
                        {c.login}
                      </a>
                    </span>
                  </td>
                  <td>{c.contributions.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const MAX_RETRIES = 6;

/** Weekly activity from GitHub's statistics API, which answers 202 until it has computed them. */
function ActivityTab({ base }: { base: string }) {
  const [activity, setActivity] = useState<RepoActivity | null>(null);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = (attempt: number) => {
      api<RepoActivity | { computing: true }>(`${base}/activity`)
        .then((data) => {
          if (!current) return;
          if ('computing' in data) {
            setComputing(true);
            if (attempt < MAX_RETRIES) timer = setTimeout(() => load(attempt + 1), 5000);
            else setError('GitHub is still computing statistics for this repository. Try again in a minute.');
            return;
          }
          setComputing(false);
          setActivity(data);
        })
        .catch((e: Error) => current && setError(e.message));
    };
    load(0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [base]);

  if (error) return <p className="error">{error}</p>;
  if (!activity) return <p className="muted">{computing ? 'GitHub is computing statistics…' : 'Loading…'}</p>;

  const weeks52 = activity.weeks.slice(-52);
  const weeks26 = activity.weeks.slice(-26);
  return (
    <div className="stack">
      <div className="panel">
        <h3>Commits per week (last 52 weeks)</h3>
        {weeks52.length === 0 ? (
          <p className="muted">No commits yet.</p>
        ) : (
          <LineChart
            ariaLabel="Commits per week"
            area
            series={[{ key: 'commits', label: 'Commits', color: 'var(--series-1)' }]}
            points={weeks52.map((w) => ({ label: weekLabel(w.week), values: { commits: w.commits } }))}
          />
        )}
      </div>
      <div className="panel">
        <h3>Lines added and removed per week (last 26 weeks)</h3>
        {weeks26.length === 0 ? (
          <p className="muted">No changes yet.</p>
        ) : (
          <DivergingBars
            ariaLabel="Lines added and removed per week"
            upLabel="Added"
            downLabel="Removed"
            bars={weeks26.map((w) => ({ label: weekLabel(w.week), up: w.additions, down: Math.abs(w.deletions) }))}
          />
        )}
        <details className="repo-data-table">
          <summary>Show as table</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Week of</th>
                  <th>Commits</th>
                  <th>Added</th>
                  <th>Removed</th>
                </tr>
              </thead>
              <tbody>
                {[...weeks52].reverse().map((w) => (
                  <tr key={w.week}>
                    <td>{weekLabel(w.week)}</td>
                    <td>{w.commits}</td>
                    <td>+{w.additions.toLocaleString()}</td>
                    <td>−{Math.abs(w.deletions).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
      <div className="panel">
        <h3>Contributors (all time)</h3>
        {activity.contributors.length === 0 ? (
          <p className="muted">No contributors yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contributor</th>
                  <th>Commits</th>
                  <th>Added</th>
                  <th>Removed</th>
                </tr>
              </thead>
              <tbody>
                {activity.contributors.map((c) => (
                  <tr key={c.login}>
                    <td>
                      <span className="repo-person">
                        {c.avatar_url && (
                          <span className="avatar small">
                            <img src={c.avatar_url} alt="" width={24} height={24} loading="lazy" />
                          </span>
                        )}
                        {c.login}
                      </span>
                    </td>
                    <td>{c.commits.toLocaleString()}</td>
                    <td>+{formatNumber(c.additions)}</td>
                    <td>−{formatNumber(Math.abs(c.deletions))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
