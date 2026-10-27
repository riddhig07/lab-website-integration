import { useEffect, useState } from 'react';
import type { Subtask } from '../types';
import { errorText, useTracker } from './api';

interface Props {
  subtasks: Subtask[];
  onToggle: (subtask: Subtask, done: boolean) => Promise<void> | void;
  onAdd?: (title: string, assignee: string | null) => Promise<void> | void;
  onDelete?: (subtask: Subtask) => Promise<void> | void;
  /** With this, each row gets an assignee picker; without it, a name chip when handed off. */
  onAssign?: (subtask: Subtask, assignee: string | null) => Promise<void> | void;
  /** The task's assignee: subtasks without their own assignee are theirs. */
  owner: string | null;
  /** Rows this person owns are emphasized (a shared task shown in their board row). */
  highlight?: string | null;
  compact?: boolean;
}

export function SubtaskProgress({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  return (
    <span className={`badge${done === total ? ' ok' : ''}`} title={`${done} of ${total} subtasks done`}>
      ☑ {done}/{total}
    </span>
  );
}

/** A task's checklist: tick items off, hand them to someone, add or remove them. */
export function SubtaskList({ subtasks, onToggle, onAdd, onDelete, onAssign, owner, highlight, compact }: Props) {
  const { team, firstName } = useTracker();
  // Optimistic ticks, cleared when fresh data arrives.
  const [pending, setPending] = useState<Record<number, boolean>>({});
  const [draft, setDraft] = useState('');
  const [draftAssignee, setDraftAssignee] = useState('');
  const [adding, setAdding] = useState(false);
  const active = team.filter((m) => m.active);
  const ownerLabel = owner ? `${firstName(owner)} (owner)` : 'Task owner';

  useEffect(() => setPending({}), [subtasks]);

  const toggle = async (s: Subtask, done: boolean) => {
    setPending((p) => ({ ...p, [s.id]: done }));
    try {
      await onToggle(s, done);
    } catch (err) {
      setPending(({ [s.id]: _, ...rest }) => rest);
      window.alert(errorText(err));
    }
  };

  const submit = async () => {
    const title = draft.trim();
    if (!title || !onAdd) return;
    setAdding(true);
    try {
      await onAdd(title, draftAssignee || null);
      setDraft('');
    } catch (err) {
      window.alert(errorText(err));
    } finally {
      setAdding(false);
    }
  };

  const options = active.map((m) => (
    <option key={m.id} value={m.github_login}>
      {m.name}
    </option>
  ));

  return (
    <div className={`subtasks${compact ? ' compact' : ''}`} onClick={(e) => e.stopPropagation()}>
      {subtasks.map((s) => {
        const done = pending[s.id] ?? s.done;
        const who = s.assignee ?? owner;
        const handedOff = !!s.assignee && s.assignee.toLowerCase() !== owner?.toLowerCase();
        const mine = !!highlight && who?.toLowerCase() === highlight.toLowerCase();
        return (
          <div key={s.id} className={`subtask${done ? ' done' : ''}${mine ? ' mine' : ''}`}>
            <input
              type="checkbox"
              checked={done}
              onChange={(e) => void toggle(s, e.target.checked)}
              aria-label={`Mark “${s.title}” ${done ? 'not done' : 'done'}`}
            />
            <span className="subtask-title" title={done && s.done_at ? `Done ${new Date(s.done_at).toLocaleString()}${s.done_by ? ` by ${s.done_by}` : ''}` : undefined}>
              {s.title}
            </span>
            {onAssign ? (
              <select
                className="subtask-assignee"
                value={s.assignee ?? ''}
                onChange={(e) => Promise.resolve(onAssign(s, e.target.value || null)).catch((err) => window.alert(errorText(err)))}
                aria-label={`Who does “${s.title}”`}
              >
                <option value="">{ownerLabel}</option>
                {options}
              </select>
            ) : (
              handedOff && <span className={`badge${mine ? ' info' : ''}`}>{firstName(s.assignee)}</span>
            )}
            {onDelete && (
              <button type="button" className="link icon" onClick={() => void onDelete(s)} aria-label={`Remove “${s.title}”`}>
                ✕
              </button>
            )}
          </div>
        );
      })}
      {onAdd && (
        <div className="subtask-add">
          <input
            value={draft}
            placeholder="+ Add subtask (Enter)"
            disabled={adding}
            maxLength={300}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <select className="subtask-assignee" value={draftAssignee} onChange={(e) => setDraftAssignee(e.target.value)} aria-label="Who does the new subtask">
            <option value="">{ownerLabel}</option>
            {options}
          </select>
        </div>
      )}
    </div>
  );
}
