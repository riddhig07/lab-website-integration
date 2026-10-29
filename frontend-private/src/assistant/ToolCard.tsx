import { useState } from 'react';
import { Link } from 'react-router';
import { STATUS_LABELS } from '../tracker/api';
import type { TaskStatus } from '../types';
import { added, initials, removed } from '../format';

/** Mirrors backend/src/ai/trackerTools.ts ToolView. */
export type ToolView =
  | { kind: 'tasks'; total: number; items: { id: number; ref: string; title: string; status: string; priority: string; assignee: string | null }[] }
  | { kind: 'people'; items: { login: string; name: string; role: string }[] }
  | { kind: 'bars'; unit: string; items: { label: string; value: number; secondary: number }[]; legend: [string, string] }
  | { kind: 'sprint'; label: string; committed: number; completed: number; pct: number; in_progress: number; blocked: number; todo: number }
  | { kind: 'rows'; total: number; items: { key: string; title: string; meta: string; state?: string; url?: string }[] }
  | { kind: 'commit'; sha: string; message: string; additions: number; deletions: number; files: { name: string; additions: number; deletions: number }[] }
  | { kind: 'error'; message: string };

export interface ToolStep {
  kind: 'tool';
  id: string;
  tool: string;
  args: Record<string, unknown>;
  status: 'running' | 'ok' | 'error';
  summary: string;
  ms: number;
  view: ToolView | null;
}

type Category = 'read' | 'write' | 'github' | 'people' | 'stats';

const TOOLS: Record<string, { label: string; category: Category }> = {
  list_team: { label: 'List team', category: 'people' },
  list_tasks: { label: 'Search tasks', category: 'read' },
  get_sprint_summary: { label: 'Sprint summary', category: 'stats' },
  get_member_stats: { label: 'GitHub activity', category: 'stats' },
  list_repos: { label: 'List repositories', category: 'github' },
  list_issues: { label: 'Search issues', category: 'github' },
  list_commits: { label: 'List commits', category: 'github' },
  get_commit: { label: 'Read commit', category: 'github' },
  get_task_commits: { label: 'Task commits', category: 'github' },
  get_task_updates: { label: 'Task updates', category: 'read' },
  create_task: { label: 'Create task', category: 'write' },
  update_task: { label: 'Update task', category: 'write' },
  add_subtasks: { label: 'Add subtasks', category: 'write' },
  assign_subtask: { label: 'Assign subtask', category: 'write' },
  set_subtask_done: { label: 'Check off subtask', category: 'write' },
  delete_subtask: { label: 'Remove subtask', category: 'write' },
  post_update: { label: 'Post update', category: 'write' },
  archive_tasks: { label: 'Archive tasks', category: 'write' },
  link_issue: { label: 'Link issue', category: 'write' },
  create_issue_from_task: { label: 'Open GitHub issue', category: 'write' },
  delete_task: { label: 'Delete task', category: 'write' },
};

export const toolLabel = (tool: string) => TOOLS[tool]?.label ?? tool;

const ICON_PATHS: Record<Category, string> = {
  read: 'M4 6h16M4 12h10M4 18h7M17 15l3 3m-1.5-4.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  write: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  github: 'M6 3v12m0 0a3 3 0 1 0 3 3m-3-3a3 3 0 0 1 3 3m9-12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 0c0 6-9 3-9 9',
  people: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM21 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  stats: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
};

function ToolIcon({ category }: { category: Category }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[category]} />
    </svg>
  );
}

/** "repo: lab-website", "status: blocked"; long text cut short. */
function argChips(args: Record<string, unknown>): string[] {
  return Object.entries(args ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      const text = Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? (x as { title?: string }).title ?? '…' : String(x))).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `${k.replace(/_/g, ' ')}: ${text.length > 40 ? `${text.slice(0, 39)}…` : text}`;
    });
}

const formatMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

export function ToolCard({ step, onNavigate }: { step: ToolStep; onNavigate: () => void }) {
  const meta = TOOLS[step.tool] ?? { label: step.tool, category: 'read' as Category };
  const [open, setOpen] = useState(true);
  const chips = argChips(step.args);
  const hasView = step.view !== null && step.status !== 'running';
  return (
    <div className={`tool-card ${meta.category} ${step.status}`}>
      <button type="button" className="tool-card-head" onClick={() => setOpen((o) => !o)} aria-expanded={hasView ? open : undefined} disabled={!hasView}>
        <span className="tool-icon">
          <ToolIcon category={meta.category} />
        </span>
        <span className="tool-title">
          <strong>{meta.label}</strong>
          <span className="tool-summary">{step.status === 'running' ? 'Running…' : step.summary}</span>
        </span>
        <span className="tool-status" aria-label={step.status}>
          {step.status === 'running' ? <span className="spinner" /> : step.status === 'ok' ? '✓' : '✕'}
        </span>
        {step.status !== 'running' && <span className="tool-ms">{formatMs(step.ms)}</span>}
        {hasView && <span className="tool-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>}
      </button>
      {chips.length > 0 && (
        <div className="tool-args">
          {chips.map((c) => (
            <span key={c} className="tool-arg">
              {c}
            </span>
          ))}
        </div>
      )}
      {hasView && open && (
        <div className="tool-view">
          <ViewBody view={step.view!} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
}

function More({ shown, total }: { shown: number; total: number }) {
  return total > shown ? <div className="tool-more">+{total - shown} more</div> : null;
}

function ViewBody({ view, onNavigate }: { view: ToolView; onNavigate: () => void }) {
  switch (view.kind) {
    case 'error':
      return <p className="error small">{view.message}</p>;
    case 'tasks':
      return view.items.length === 0 ? (
        <p className="muted small">No matching tasks.</p>
      ) : (
        <>
          <ul className="tv-list">
            {view.items.map((t) => (
              <li key={t.id}>
                <Link to={`/tracker?task=${t.id}`} className="mono tv-key" onClick={onNavigate}>
                  {t.ref}
                </Link>
                <span className="tv-title">{t.title}</span>
                <span className="badges">
                  {t.priority !== 'none' && <span className={`badge ${t.priority.toLowerCase()}`}>{t.priority}</span>}
                  <span className={`badge ${t.status === 'done' ? 'ok' : t.status === 'blocked' ? 'warn' : t.status === 'in-progress' ? 'info' : ''}`}>
                    {STATUS_LABELS[t.status as TaskStatus] ?? t.status}
                  </span>
                </span>
                <span className="tv-meta">{t.assignee ? `@${t.assignee}` : 'unassigned'}</span>
              </li>
            ))}
          </ul>
          <More shown={view.items.length} total={view.total} />
        </>
      );
    case 'people':
      return (
        <div className="tv-people">
          {view.items.map((p) => (
            <span key={p.login} className="tv-person" title={`@${p.login}`}>
              <span className="avatar small">{initials(p.name || p.login)}</span>
              <span>
                {p.name || p.login}
                <span className="muted"> · {p.role}</span>
              </span>
            </span>
          ))}
        </div>
      );
    case 'bars':
      return <Bars view={view} />;
    case 'sprint':
      return <Sprint view={view} />;
    case 'rows':
      return view.items.length === 0 ? (
        <p className="muted small">Nothing found.</p>
      ) : (
        <>
          <ul className="tv-list">
            {view.items.map((r, i) => (
              <li key={`${r.key}-${i}`}>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="mono tv-key">
                    {r.key}
                  </a>
                ) : (
                  <span className="mono tv-key">{r.key}</span>
                )}
                <span className="tv-title">{r.title}</span>
                {r.state && <span className={`badge ${r.state}`}>{r.state}</span>}
                {r.meta && <span className="tv-meta">{r.meta}</span>}
              </li>
            ))}
          </ul>
          <More shown={view.items.length} total={view.total} />
        </>
      );
    case 'commit': {
      const max = Math.max(1, ...view.files.map((f) => f.additions + f.deletions));
      return (
        <div className="tv-commit">
          <div className="tv-commit-head">
            <span className="mono">{view.sha}</span> <span className="tv-title">{view.message}</span>
            <span className="tv-diff">
              <span className="add">{added(view.additions)}</span> <span className="del">{removed(view.deletions)}</span>
            </span>
          </div>
          <ul className="tv-files">
            {view.files.map((f) => (
              <li key={f.name}>
                <span className="mono tv-file" title={f.name}>
                  {f.name}
                </span>
                <span className="tv-diffbar" title={`${added(f.additions)} ${removed(f.deletions)}`}>
                  <span className="add" style={{ width: `${(f.additions / max) * 100}%` }} />
                  <span className="del" style={{ width: `${(f.deletions / max) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
  }
}

/** Horizontal stacked bars: merged (series 1) then on-a-branch (series 2). */
function Bars({ view }: { view: Extract<ToolView, { kind: 'bars' }> }) {
  const max = Math.max(1, ...view.items.map((i) => i.value + i.secondary));
  return (
    <div className="tv-bars">
      <div className="tv-legend small">
        <span>
          <i className="sw s1" />
          {view.legend[0]}
        </span>
        <span>
          <i className="sw s2" />
          {view.legend[1]}
        </span>
        <span className="muted">{view.unit}</span>
      </div>
      {view.items.map((i) => (
        <div key={i.label} className="tv-bar-row">
          <span className="tv-bar-label" title={`@${i.label}`}>
            {i.label}
          </span>
          <span className="tv-bar-track">
            {i.value > 0 && <span className="seg s1" style={{ width: `${(i.value / max) * 100}%` }} title={`${i.label}: ${i.value} ${view.legend[0]}`} />}
            {i.secondary > 0 && <span className="seg s2" style={{ width: `${(i.secondary / max) * 100}%` }} title={`${i.label}: ${i.secondary} ${view.legend[1]}`} />}
          </span>
          <span className="tv-bar-value">{i.value + i.secondary}</span>
        </div>
      ))}
    </div>
  );
}

function Sprint({ view }: { view: Extract<ToolView, { kind: 'sprint' }> }) {
  return (
    <div className="tv-sprint">
      <div className="tv-sprint-top">
        <span className="tv-sprint-pct">{view.pct}%</span>
        <span className="muted small">
          {view.label} · {view.completed} of {view.committed} done
        </span>
      </div>
      <div className="tv-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.pct} aria-label="Completion">
        <span style={{ width: `${Math.min(100, view.pct)}%` }} />
      </div>
      <div className="badges">
        <span className="badge info">{view.in_progress} in progress</span>
        <span className="badge warn">{view.blocked} blocked</span>
        <span className="badge">{view.todo} todo</span>
      </div>
    </div>
  );
}
