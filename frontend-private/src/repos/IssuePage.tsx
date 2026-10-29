import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api';
import { timeAgo } from '../format';
import { Markdown } from '../Markdown';
import type { IssueDetail, Task } from '../types';
import { LabelBadges, repoPath, StateBadge } from './shared';

const STATUS_LABELS: Record<Task['status'], string> = {
  todo: 'Todo',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};
const STATUS_BADGE: Record<Task['status'], string> = { todo: '', 'in-progress': 'info', blocked: 'bad', done: 'ok' };

/** /repos/:owner/:name/issues/:number: an issue or pull request, its comments, and the tasks tracking it. */
export function IssuePage() {
  const { owner = '', name = '', number = '' } = useParams();
  const navigate = useNavigate();
  const fullName = `${owner}/${name}`;
  const path = `/internal/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${encodeURIComponent(number)}`;
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    setIssue(null);
    setTasks(null);
    setError(null);
    api<IssueDetail>(path)
      .then((i) => current && setIssue(i))
      .catch((e: Error) => current && setError(e.message));
    api<Task[]>(`/internal/tracker/linked?${new URLSearchParams({ repo: fullName, number })}`)
      .then((t) => current && setTasks(t))
      .catch(() => current && setTasks([]));
    return () => {
      current = false;
    };
  }, [path, fullName, number]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const postComment = () =>
    run(async () => {
      setIssue(await api<IssueDetail>(`${path}/comments`, { method: 'POST', body: { body: comment.trim() } }));
      setComment('');
    });

  const setState = (state: 'open' | 'closed') =>
    run(async () => {
      setIssue(await api<IssueDetail>(`${path}/state`, { method: 'POST', body: { state } }));
    });

  const track = () =>
    run(async () => {
      if (!issue) return;
      const body = issue.body.trim();
      const task = await api<Task>('/internal/tracker/tasks', {
        method: 'POST',
        body: {
          title: issue.title.slice(0, 300),
          description: `${issue.url}${body ? `\n\n${body.slice(0, 1500)}${body.length > 1500 ? '…' : ''}` : ''}`,
          task_type: issue.is_pr ? 'code' : 'research',
          link: { repo: issue.repo, number: issue.number },
        },
      });
      navigate(`/tracker?task=${task.id}`);
    });

  const kind = issue?.is_pr ? 'pull request' : 'issue';

  return (
    <>
      <nav className="breadcrumbs small" aria-label="Breadcrumb">
        <Link to="/repos">Repositories</Link> <span className="muted">/</span> <Link to={repoPath(fullName)}>{name}</Link>{' '}
        <span className="muted">/</span> #{number}
      </nav>
      {error && <p className="error">{error}</p>}
      {!issue && !error && <p className="muted">Loading…</p>}
      {issue && (
        <>
          <div className="page-header">
            <div>
              <h1>
                {issue.title} <span className="muted">#{issue.number}</span>
              </h1>
              <div className="repo-issue-meta">
                <StateBadge item={issue} />
                <span className="muted small">
                  {issue.user ? `opened by @${issue.user}` : 'opened'} · <span title={new Date(issue.created_at).toLocaleString()}>{timeAgo(issue.created_at)}</span> ·{' '}
                  {issue.comment_list.length} comment{issue.comment_list.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <a className="button secondary" href={issue.url} target="_blank" rel="noreferrer">
              Open on GitHub ↗
            </a>
          </div>

          <div className="repo-issue-layout">
            <div className="stack">
              <div className="panel">
                {issue.body.trim() ? <Markdown text={issue.body} /> : <p className="muted">No description.</p>}
              </div>

              {issue.comment_list.map((c) => (
                <div key={c.id} className="panel">
                  <div className="repo-comment-header small">
                    <strong>{c.user ? `@${c.user}` : 'unknown'}</strong>{' '}
                    <a className="muted" href={c.url} target="_blank" rel="noreferrer" title={new Date(c.created_at).toLocaleString()}>
                      {timeAgo(c.created_at)}
                    </a>
                  </div>
                  {c.body.trim() ? <Markdown text={c.body} /> : <p className="muted">(empty)</p>}
                </div>
              ))}

              <form
                className="panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (comment.trim()) void postComment();
                }}
              >
                <label htmlFor="issue-comment" className="section-label">
                  Add a comment
                </label>
                <textarea id="issue-comment" rows={4} maxLength={10000} value={comment} onChange={(e) => setComment(e.target.value)} disabled={busy} />
                <p className="muted small">Posted by the lab's GitHub App, signed with your username.</p>
                {actionError && <p className="error">{actionError}</p>}
                <div className="button-row">
                  <button type="submit" disabled={busy || !comment.trim()}>
                    Comment
                  </button>
                  {!issue.is_pr && (
                    <button type="button" className="secondary" disabled={busy} onClick={() => void setState(issue.state === 'open' ? 'closed' : 'open')}>
                      {issue.state === 'open' ? 'Close issue' : 'Reopen issue'}
                    </button>
                  )}
                </div>
              </form>
            </div>

            <aside className="stack">
              <div className="panel">
                <h3>Details</h3>
                <dl className="repo-details">
                  <dt>Labels</dt>
                  <dd>{issue.labels.length ? <LabelBadges labels={issue.labels} /> : <span className="muted">None</span>}</dd>
                  <dt>Assignees</dt>
                  <dd>{issue.assignees.length ? issue.assignees.map((a) => `@${a}`).join(', ') : <span className="muted">None</span>}</dd>
                  {issue.is_pr && issue.head && (
                    <>
                      <dt>Branch</dt>
                      <dd className="mono">
                        {issue.head} → {issue.base}
                      </dd>
                    </>
                  )}
                  <dt>Updated</dt>
                  <dd title={new Date(issue.updated_at).toLocaleString()}>{timeAgo(issue.updated_at)}</dd>
                </dl>
              </div>
              <div className="panel">
                <h3>Task board</h3>
                {!tasks && <p className="muted small">Loading…</p>}
                {tasks && tasks.length === 0 && <p className="muted small">No task tracks this {kind} yet.</p>}
                {tasks && tasks.length > 0 && (
                  <ul className="repo-task-list">
                    {tasks.map((t) => (
                      <li key={t.id}>
                        <Link to={`/tracker?task=${t.id}`}>
                          <span className="muted">{t.ref}</span> {t.title}
                        </Link>{' '}
                        <span className={`badge ${STATUS_BADGE[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="secondary small" disabled={busy} onClick={() => void track()}>
                  Track as task
                </button>
                {!issue.is_pr && <p className="muted small">Closing this issue marks its tasks done.</p>}
              </div>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
