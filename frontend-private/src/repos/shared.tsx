import { Fragment, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { timeAgo } from '../format';
import type { IssueSummary } from '../types';

/** "owner/name" -> the portal path of its repository page. */
export const repoPath = (fullName: string) => `/repos/${fullName}`;

export const issuePath = (fullName: string, number: number) => `/repos/${fullName}/issues/${number}`;

export const shortName = (fullName: string) => fullName.split('/').pop() ?? fullName;

export function StateBadge({ item }: { item: Pick<IssueSummary, 'state' | 'is_pr' | 'merged' | 'draft' | 'state_reason'> }) {
  if (item.is_pr && item.merged) return <span className="badge merged">Merged</span>;
  if (item.is_pr && item.draft && item.state === 'open') return <span className="badge closed">Draft</span>;
  if (item.state === 'open') return <span className="badge open">Open</span>;
  return <span className="badge closed">{item.state_reason === 'not_planned' ? 'Not planned' : 'Closed'}</span>;
}

export function LabelBadges({ labels }: { labels: IssueSummary['labels'] }) {
  if (labels.length === 0) return null;
  return (
    <span className="badges">
      {labels.map((l) => (
        <span key={l.name} className="badge label">
          <span className="dot" style={{ background: `#${l.color}` }} />
          {l.name}
        </span>
      ))}
    </span>
  );
}

/** Turns T-123 task refs in text into links to the task board. */
export function withTaskRefs(text: string): ReactNode[] {
  return text.split(/(\bT-\d+\b)/).map((part, i) => {
    const m = /^T-(\d+)$/.exec(part);
    return m ? (
      <Link key={i} to={`/tracker?task=${m[1]}`} onClick={(e) => e.stopPropagation()}>
        {part}
      </Link>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    );
  });
}

export const StateSelect = ({ value, onChange }: { value: string; onChange: (v: 'open' | 'closed' | 'all') => void }) => (
  <select aria-label="State" value={value} onChange={(e) => onChange(e.target.value as 'open' | 'closed' | 'all')}>
    <option value="open">Open</option>
    <option value="closed">Closed</option>
    <option value="all">All</option>
  </select>
);

/** Issues or pull requests as a table; `showRepo` adds the repository column (org-wide lists). */
export function IssueTable({ items, showRepo = false }: { items: IssueSummary[]; showRepo?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {showRepo && <th>Repository</th>}
            <th>Title</th>
            <th>Author</th>
            <th>Assignees</th>
            <th aria-label="Comments">💬</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={`${i.repo}#${i.number}`} className="clickable" onClick={() => navigate(issuePath(i.repo, i.number))}>
              {showRepo && (
                <td className="muted">
                  <Link to={repoPath(i.repo)} onClick={(e) => e.stopPropagation()}>
                    {shortName(i.repo)}
                  </Link>
                </td>
              )}
              <td>
                <div className="repo-issue-title">
                  <Link to={issuePath(i.repo, i.number)} onClick={(e) => e.stopPropagation()}>
                    {i.title}
                  </Link>{' '}
                  <span className="muted">#{i.number}</span>
                </div>
                <div className="badges repo-issue-badges">
                  {(i.state !== 'open' || i.is_pr) && <StateBadge item={i} />}
                  <LabelBadges labels={i.labels} />
                </div>
              </td>
              <td className="muted">{i.user ? `@${i.user}` : '—'}</td>
              <td className="muted small">{i.assignees.length ? i.assignees.map((a) => `@${a}`).join(', ') : '—'}</td>
              <td className="muted">{i.comments || ''}</td>
              <td className="muted" title={new Date(i.updated_at).toLocaleString()}>
                {timeAgo(i.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
