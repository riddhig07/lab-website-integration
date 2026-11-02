import './repos.css';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api';
import { timeAgo } from '../format';
import type { IssueSummary, RepoSummary } from '../types';
import { IssueTable, repoPath, StateSelect } from './shared';

const TABS = [
  { key: 'repos', label: 'Repositories' },
  { key: 'issues', label: 'Open issues' },
  { key: 'pulls', label: 'Open pull requests' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** /repos: the org's repositories, plus issues and pull requests across all of them. */
export function ReposPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabKey = TABS.some((t) => t.key === params.get('tab')) ? (params.get('tab') as TabKey) : 'repos';

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Repositories</h1>
          <p className="muted">Every repository in the lab's GitHub organization, read through the lab's GitHub App.</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams(t.key === 'repos' ? {} : { tab: t.key }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'repos' ? <RepoList /> : <OrgIssues kind={tab === 'pulls' ? 'pr' : 'issue'} />}
    </>
  );
}

function RepoList() {
  const navigate = useNavigate();
  const [repos, setRepos] = useState<RepoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const [refreshing, setRefreshing] = useState(false);

  // Opening the page (or pressing Refresh) re-reads the org from GitHub, so a
  // repository moved in a moment ago shows up without waiting out the cache.
  const load = () => {
    setRefreshing(true);
    api<RepoSummary[]>('/internal/github/repos?refresh=1')
      .then((r) => {
        setRepos(r);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setRefreshing(false));
  };

  useEffect(load, []);

  const q = filter.trim().toLowerCase();
  const shown = (repos ?? []).filter(
    (r) => !q || `${r.name} ${r.description ?? ''} ${r.language ?? ''} ${r.topics.join(' ')}`.toLowerCase().includes(q),
  );

  return (
    <>
      <div className="toolbar">
        <input type="search" placeholder="Filter repositories" aria-label="Filter repositories" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {repos && <span className="muted small">{repos.length} repositories</span>}
        <button type="button" onClick={load} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {!repos && !error && <p className="muted">Loading…</p>}
      {repos && shown.length === 0 && <p className="muted">{repos.length ? `Nothing matches “${filter}”.` : 'The GitHub App has no repositories.'}</p>}
      {shown.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Repository</th>
                <th>Open issues</th>
                <th>Open PRs</th>
                <th>Last push</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.full_name} className="clickable" onClick={() => navigate(repoPath(r.full_name))}>
                  <td>
                    <div className="repo-name">
                      <Link to={repoPath(r.full_name)} onClick={(e) => e.stopPropagation()}>
                        {r.name}
                      </Link>
                      <span className="badges">
                        {r.private && <span className="badge">Private</span>}
                        {r.archived && <span className="badge warn">Archived</span>}
                        {r.fork && <span className="badge">Fork</span>}
                        {r.language && <span className="badge info">{r.language}</span>}
                      </span>
                    </div>
                    {r.description && <div className="muted small">{r.description}</div>}
                  </td>
                  <td>{r.open_issues}</td>
                  <td>{r.open_prs}</td>
                  <td className="muted" title={r.pushed_at ? new Date(r.pushed_at).toLocaleString() : undefined}>
                    {timeAgo(r.pushed_at)}
                  </td>
                  <td className="row-actions">
                    <a className="link" href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      GitHub ↗
                    </a>
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

/** Issues or pull requests across every repo, via GitHub search. */
function OrgIssues({ kind }: { kind: 'issue' | 'pr' }) {
  const [state, setState] = useState<'open' | 'closed' | 'all'>('open');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<IssueSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let current = true;
    setItems(null);
    setError(null);
    const params = new URLSearchParams({ kind, state });
    if (debounced) params.set('q', debounced);
    api<IssueSummary[]>(`/internal/github/issues?${params}`)
      .then((list) => current && setItems(list))
      .catch((e: Error) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [kind, state, debounced]);

  const noun = kind === 'pr' ? 'pull requests' : 'issues';
  return (
    <>
      <div className="toolbar">
        <StateSelect value={state} onChange={setState} />
        <input type="search" placeholder={`Search ${noun}`} aria-label={`Search ${noun}`} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      {!items && !error && <p className="muted">Loading…</p>}
      {items && items.length === 0 && <p className="muted">No {noun} found.</p>}
      {items && items.length > 0 && <IssueTable items={items} showRepo />}
    </>
  );
}
