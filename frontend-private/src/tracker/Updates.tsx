import { useState } from 'react';
import { timeAgo } from '../format';
import type { Task } from '../types';
import { errorText, isSame, tracker, useTracker } from './api';

interface Props {
  task: Task;
  onChanged: (task: Task) => void;
  /** Cards show the newest few; the task dialog shows the whole history. */
  limit?: number;
  compact?: boolean;
}

/** A task's progress-update feed plus a box to post a new one. */
export function Updates({ task, onChanged, limit, compact }: Props) {
  const { config, firstName } = useTracker();
  const [draft, setDraft] = useState('');
  const [subtaskId, setSubtaskId] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subtaskTitle = new Map(task.subtasks.map((s) => [s.id, s.title]));
  const shown = limit ? task.updates.slice(0, limit) : task.updates;

  const post = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError(null);
    try {
      onChanged(await tracker.postUpdate(task.id, body, subtaskId ? Number(subtaskId) : null));
      setDraft('');
      setSubtaskId('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPosting(false);
    }
  };

  const remove = async (updateId: number) => {
    if (!window.confirm('Delete this update?')) return;
    try {
      onChanged(await tracker.deleteUpdate(task.id, updateId));
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className={`updates${compact ? ' compact' : ''}`} onClick={(e) => e.stopPropagation()}>
      <textarea
        value={draft}
        rows={2}
        maxLength={2000}
        disabled={posting}
        placeholder="Post an update: what moved, what's next, what's blocking…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void post();
          }
        }}
      />
      <div className="updates-actions">
        {task.subtasks.length > 0 && (
          <select value={subtaskId} onChange={(e) => setSubtaskId(e.target.value)} aria-label="Which subtask this update is about">
            <option value="">About: the whole task</option>
            {task.subtasks.map((s) => (
              <option key={s.id} value={s.id}>
                About: {s.title}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="small" onClick={() => void post()} disabled={posting || !draft.trim()}>
          {posting ? 'Posting…' : 'Post update'}
        </button>
      </div>
      {error && <p className="error small">{error}</p>}
      {shown.length > 0 && (
        <ul className="update-list">
          {shown.map((u) => (
            <li key={u.id}>
              <div className="update-meta">
                <strong>{firstName(u.author)}</strong>
                <span title={new Date(u.created_at).toLocaleString()}>{timeAgo(u.created_at)}</span>
                {u.subtask_id !== null && subtaskTitle.has(u.subtask_id) && <span className="badge">☑ {subtaskTitle.get(u.subtask_id)}</span>}
                {isSame(u.author, config.me.actor) && (
                  <button type="button" className="link icon" onClick={() => void remove(u.id)} aria-label="Delete this update">
                    ✕
                  </button>
                )}
              </div>
              <p>{u.body}</p>
            </li>
          ))}
        </ul>
      )}
      {!!limit && task.updates.length > limit && (
        <p className="muted small">
          {task.updates.length - limit} older update{task.updates.length - limit === 1 ? '' : 's'} in the task
        </p>
      )}
    </div>
  );
}
