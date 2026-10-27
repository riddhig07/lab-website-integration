import { useEffect, useState } from 'react';
import { LineChart } from '../charts';
import type { SprintInfo, SprintSummary } from '../types';
import { errorText, STATUS_LABELS, tracker, useTracker } from './api';

interface Props {
  sprints: SprintInfo[];
  currentKey: string | null;
}

function statusLine(s: SprintSummary): string {
  if (s.status === 'closed') return `Closed ${new Date(s.end_at).toLocaleDateString()}`;
  const days = Math.max(0, Math.ceil((new Date(s.end_at).getTime() - Date.now()) / 86_400_000));
  return `Active · ends ${new Date(s.end_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} (${days} day${days === 1 ? '' : 's'} left)`;
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((100 * done) / total) : 0;
  return (
    <span className="progress" title={`${done} of ${total} done`}>
      <span className="progress-track">
        <span className="progress-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="small">
        {done}/{total}
      </span>
    </span>
  );
}

/** Team-wide sprint overview: scorecard, burn-up, per-person progress, and the work itself. */
export function SprintsTab({ sprints, currentKey }: Props) {
  const { openTask, firstName } = useTracker();
  const [key, setKey] = useState<string | null>(currentKey);
  const [summary, setSummary] = useState<SprintSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key && currentKey) setKey(currentKey);
  }, [currentKey, key]);

  useEffect(() => {
    if (!key) return;
    let stale = false;
    setError(null);
    tracker
      .summary(key)
      .then((s) => !stale && setSummary(s))
      .catch((e) => !stale && setError(errorText(e)));
    return () => {
      stale = true;
    };
  }, [key]);

  if (!key) return <p className="muted">Loading sprints…</p>;
  const s = summary?.key === key ? summary : null;
  const t = s?.totals;
  const done = s?.tasks.filter((x) => x.completed) ?? [];
  const open = s?.tasks.filter((x) => !x.completed) ?? [];
  // A burn-up starts from zero at kickoff.
  const points = s
    ? [
        { label: 'Start', values: { completed: 0, committed: s.totals.committed } },
        ...s.burnup.map((p) => ({
          label: new Date(`${p.date}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric' }),
          values: { completed: p.completed, committed: s.totals.committed },
        })),
      ]
    : [];

  return (
    <div className="stack">
      <div className="toolbar">
        <div>
          <h2 className="tab-title">{s?.label ?? 'Sprint'}</h2>
          {s && <div className="muted small">{statusLine(s)}</div>}
        </div>
        <span className="spacer" />
        <select value={key} onChange={(e) => setKey(e.target.value)} aria-label="Sprint to show">
          {sprints.map((sp) => (
            <option key={sp.key} value={sp.key}>
              {sp.label}
              {sp.key === currentKey ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      {!s && !error && <p className="muted">Loading…</p>}
      {s && t && (
        <>
          <div className="tiles">
            <Tile label="Committed" value={t.committed} sub={t.created_in_sprint ? `${t.created_in_sprint} created this sprint` : undefined} />
            <Tile label="Completed" value={t.completed} />
            <Tile label="Completion" value={`${t.completion_pct}%`} />
            <Tile label="Unfinished" value={t.unfinished} sub={`${t.in_progress} in progress · ${t.blocked} blocked`} />
            <Tile label="Subtasks checked" value={t.subtasks_checked} />
            <Tile label="Updates" value={t.updates} />
            <Tile label="Commits" value={t.commits} sub={`${t.commits_merged} merged`} />
          </div>

          <div className="grid-2">
            <section className="panel">
              <h3>Burn-up</h3>
              {points.length > 1 ? (
                <LineChart
                  ariaLabel={`Burn-up: ${t.completed} of ${t.committed} tasks completed`}
                  height={200}
                  points={points}
                  series={[
                    { key: 'completed', label: 'Completed', color: 'var(--series-1)' },
                    { key: 'committed', label: 'Committed', color: 'var(--muted)', reference: true },
                  ]}
                />
              ) : (
                <p className="muted small">No days yet.</p>
              )}
            </section>
            <section className="panel">
              <h3>By person</h3>
              {s.people.length === 0 && <p className="muted small">No one has work in this sprint yet.</p>}
              <ul className="person-progress">
                {s.people.map((p) => (
                  <li key={p.login}>
                    <div className="person-progress-head">
                      <strong className="truncate">{p.name}</strong>
                      <Progress done={p.completed} total={p.committed} />
                    </div>
                    <div className="muted small">
                      {[
                        p.in_progress && `${p.in_progress} in progress`,
                        p.blocked && `${p.blocked} blocked`,
                        p.todo && `${p.todo} not started`,
                        p.helping && `helping on ${p.helping}`,
                        p.subtasks_total && `☑ ${p.subtasks_done}/${p.subtasks_total}`,
                        `${p.updates} update${p.updates === 1 ? '' : 's'}`,
                        `${p.commits} commit${p.commits === 1 ? '' : 's'}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid-2">
            <section className="panel">
              <h3>Completed ({done.length})</h3>
              {done.length === 0 && <p className="muted small">Nothing yet.</p>}
              {done.map((x) => (
                <button key={x.id} type="button" className="sprint-task" onClick={() => openTask(x.id)}>
                  <span className="ok-text">✓</span>
                  <span className="sprint-task-title">{x.title}</span>
                  <span className="muted small">{x.owner ? firstName(x.owner) : 'unassigned'}</span>
                </button>
              ))}
            </section>
            <section className="panel">
              <h3>
                {s.status === 'closed' ? 'Not finished' : 'Still open'} ({open.length})
              </h3>
              {open.length === 0 && <p className="muted small">All done.</p>}
              {open.map((x) => (
                <button key={x.id} type="button" className="sprint-task" onClick={() => openTask(x.id)}>
                  <span className="muted">○</span>
                  <span className="sprint-task-title">{x.title}</span>
                  <span className="muted small">
                    {STATUS_LABELS[x.status]}
                    {s.status === 'closed' && x.moved_on ? ' · moved on' : ''} · {x.owner ? firstName(x.owner) : 'unassigned'}
                  </span>
                </button>
              ))}
            </section>
          </div>

          {s.updates.length > 0 && (
            <section className="panel">
              <h3>Updates this sprint</h3>
              <ul className="update-list">
                {s.updates.slice(0, 20).map((u, i) => (
                  <li key={i}>
                    <div className="update-meta">
                      <strong>{firstName(u.author)}</strong>
                      <span>{u.task}</span>
                      <span>{new Date(u.at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    </div>
                    <p>{u.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export function Tile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: 'p0' | 'p1' }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className={`tile-value${tone ? ` ${tone}` : ''}`}>{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}
