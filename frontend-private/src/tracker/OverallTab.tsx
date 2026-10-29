import { useEffect, useMemo, useState } from 'react';
import { DivergingBars, LineChart, weekLabel } from '../charts';
import { added, removed } from '../format';
import type { OverallStats } from '../types';
import { errorText, tracker } from './api';
import { Tile } from './SprintsTab';

const PRESETS = [
  { label: 'Last 4 weeks', weeks: 4 },
  { label: 'Last 12 weeks', weeks: 12 },
  { label: 'Last 26 weeks', weeks: 26 },
  { label: 'Last year', weeks: 52 },
  { label: 'All time', weeks: 0 },
];

/** Org-wide GitHub activity: commits and lines per week, and who contributed. */
export function OverallTab() {
  const [data, setData] = useState<OverallStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepo] = useState('');
  const [weeks, setWeeks] = useState(12);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stale = false;
    tracker
      .overall(repo || undefined)
      .then((d) => {
        if (stale) return;
        setData(d);
        setError(null);
        // GitHub computes statistics on first request; ask again shortly.
        if (d.computing.length && attempt < 6) setTimeout(() => !stale && setAttempt((a) => a + 1), 5000);
      })
      .catch((e) => !stale && setError(errorText(e)));
    return () => {
      stale = true;
    };
  }, [repo, attempt]);

  const from = weeks ? Date.now() / 1000 - weeks * 7 * 86_400 : 0;
  const inRange = useMemo(() => (data?.weeks ?? []).filter((w) => w.week >= from), [data, from]);
  const contributors = useMemo(
    () =>
      (data?.contributors ?? [])
        .map((c) => {
          const ws = c.weeks.filter((w) => w.week >= from);
          return {
            ...c,
            commits: ws.reduce((s, w) => s + w.commits, 0),
            additions: ws.reduce((s, w) => s + w.additions, 0),
            deletions: ws.reduce((s, w) => s + w.deletions, 0),
          };
        })
        .filter((c) => c.commits > 0)
        .sort((a, b) => b.commits - a.commits),
    [data, from],
  );
  const totals = {
    commits: inRange.reduce((s, w) => s + w.commits, 0),
    additions: inRange.reduce((s, w) => s + w.additions, 0),
    deletions: inRange.reduce((s, w) => s + Math.abs(w.deletions), 0),
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="Time range">
          {PRESETS.map((p) => (
            <option key={p.label} value={p.weeks}>
              {p.label}
            </option>
          ))}
        </select>
        <select value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="Repository">
          <option value="">All repositories</option>
          {(data?.repos ?? []).map((r) => (
            <option key={r} value={r}>
              {r.split('/')[1]}
            </option>
          ))}
        </select>
        {data && data.computing.length > 0 && (
          <span className="muted small">GitHub is still computing statistics for {data.computing.map((r) => r.split('/')[1]).join(', ')}…</span>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && (
        <div className={data.computing.length && !inRange.length ? 'refetching' : undefined}>
          <div className="tiles">
            <Tile label="Commits" value={totals.commits.toLocaleString()} />
            <Tile label="Lines added" value={added(totals.additions)} />
            <Tile label="Lines removed" value={removed(totals.deletions)} />
            <Tile label="Contributors" value={contributors.length} />
          </div>
          <div className="stack">
            <section className="panel">
              <h3>Commits per week</h3>
              {inRange.length ? (
                <LineChart
                  area
                  ariaLabel={`Commits per week, ${totals.commits} in range`}
                  points={inRange.map((w) => ({ label: weekLabel(w.week), values: { commits: w.commits } }))}
                  series={[{ key: 'commits', label: 'Commits', color: 'var(--series-1)' }]}
                />
              ) : (
                <p className="muted small">No commits in this range.</p>
              )}
            </section>
            <section className="panel">
              <h3>Lines added and removed per week</h3>
              {inRange.length ? (
                <DivergingBars
                  ariaLabel="Lines added and removed per week"
                  upLabel="Added"
                  downLabel="Removed"
                  bars={inRange.map((w) => ({ label: weekLabel(w.week), up: w.additions, down: Math.abs(w.deletions) }))}
                />
              ) : (
                <p className="muted small">No changes in this range.</p>
              )}
              <details className="table-toggle">
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
                      {[...inRange].reverse().map((w) => (
                        <tr key={w.week}>
                          <td>{weekLabel(w.week)}</td>
                          <td>{w.commits}</td>
                          <td>{added(w.additions)}</td>
                          <td>{removed(w.deletions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
            <section className="panel">
              <h3>Contributors</h3>
              {contributors.length === 0 ? (
                <p className="muted small">No contributors in this range.</p>
              ) : (
                <div className="table-wrap flat">
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
                      {contributors.map((c) => (
                        <tr key={c.login}>
                          <td>
                            <span className="contributor">
                              {c.avatar_url && (
                                <span className="avatar small">
                                  <img src={c.avatar_url} alt="" loading="lazy" />
                                </span>
                              )}
                              <a href={`https://github.com/${c.login}`} target="_blank" rel="noreferrer">
                                {c.login}
                              </a>
                            </span>
                          </td>
                          <td>{c.commits}</td>
                          <td>{added(c.additions)}</td>
                          <td>{removed(c.deletions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
