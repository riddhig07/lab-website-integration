import { useState } from 'react';
import { added, initials, removed } from '../format';
import type { Member, Task, TaskStatus } from '../types';
import { isInvolved, ROLE_LABELS, STATUS_LABELS, STATUSES, useTracker } from './api';
import { TaskCard } from './TaskCard';

interface Props {
  tasks: Task[];
  onAdd: (assignee: string | null, status: TaskStatus) => void;
  onEditMember: (member: Member) => void;
}

/** One person at a time: who they are, their GitHub week, and their work by status. */
export function ByPerson({ tasks, onAdd, onEditMember }: Props) {
  const { team, stats, config } = useTracker();
  const [selected, setSelected] = useState<string | null>(config.me.member?.github_login ?? null);
  const member = team.find((m) => m.github_login === selected) ?? null;
  const mine = member ? tasks.filter((t) => isInvolved(t, member.github_login)) : [];
  const s = member ? stats.get(member.github_login.toLowerCase()) : undefined;

  return (
    <div className="by-person">
      <nav className="panel person-list" aria-label="Team">
        {team.length === 0 && <p className="muted small">No members yet.</p>}
        {team.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`person-row${m.github_login === selected ? ' active' : ''}`}
            onClick={() => setSelected(m.github_login)}
            aria-pressed={m.github_login === selected}
          >
            <span className={`presence${m.active ? ' on' : ''}`} aria-label={m.active ? 'Active' : 'Inactive'} />
            <span className="truncate">{m.name}</span>
            <span className="badge">{ROLE_LABELS[m.role]}</span>
          </button>
        ))}
      </nav>
      <div className="stack">
        {!member ? (
          <p className="panel muted">Pick someone to see their tasks and GitHub activity.</p>
        ) : (
          <>
            <div className="panel person-head">
              <span className="avatar">{initials(member.name)}</span>
              <div className="person-head-text">
                <h2>{member.name}</h2>
                <p className="muted small">
                  {ROLE_LABELS[member.role]} ·{' '}
                  <a href={`https://github.com/${member.github_login}`} target="_blank" rel="noreferrer">
                    @{member.github_login}
                  </a>
                  {member.slack_user_id ? ' · Slack linked' : ''}
                  {!member.active && ' · inactive'}
                </p>
              </div>
              <div className="button-row">
                <button type="button" className="secondary small" onClick={() => onEditMember(member)}>
                  Edit
                </button>
                <button type="button" className="small" onClick={() => onAdd(member.github_login, 'todo')}>
                  + Task
                </button>
              </div>
            </div>
            <div className="panel">
              <h3>GitHub, last 7 days</h3>
              {!s ? (
                <p className="muted small">No activity collected yet.</p>
              ) : (
                <div className="tiles compact">
                  <div className="tile">
                    <div className="tile-label">Commits</div>
                    <div className="tile-value">{s.commit_count}</div>
                    <div className="tile-sub">
                      {s.merged_count} merged · {s.unmerged_count} on a branch
                    </div>
                  </div>
                  <div className="tile">
                    <div className="tile-label">Lines added</div>
                    <div className="tile-value">{added(s.additions)}</div>
                    <div className="tile-sub">
                      {added(s.merged_additions)} merged · {added(s.unmerged_additions)} on a branch
                    </div>
                  </div>
                  <div className="tile">
                    <div className="tile-label">Lines removed</div>
                    <div className="tile-value">{removed(s.deletions)}</div>
                    <div className="tile-sub">
                      {removed(s.merged_deletions)} merged · {removed(s.unmerged_deletions)} on a branch
                    </div>
                  </div>
                  <div className="tile">
                    <div className="tile-label">Repos</div>
                    <div className="tile-value">{s.repos.length}</div>
                    <div className="tile-sub truncate" title={s.repos.join(', ')}>
                      {s.repos.map((r) => r.split('/')[1]).join(', ') || '—'}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="person-lanes">
              {STATUSES.map((status) => {
                const lane = mine.filter((t) => t.status === status);
                return (
                  <section key={status} className="panel">
                    <h3>
                      {STATUS_LABELS[status]} <span className="muted">· {lane.length}</span>
                    </h3>
                    <div className="stack tight">
                      {lane.length === 0 && <p className="muted small">No tasks</p>}
                      {lane.map((t) => (
                        <TaskCard key={t.id} task={t} viewer={member.github_login} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
