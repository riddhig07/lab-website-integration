import { useEffect, useState, type DragEvent } from 'react';
import type { Task, TaskStatus } from '../types';
import { errorText, isSame, priorityClass, STATUS_LABELS, STATUSES, subtaskOwner, tracker, useTracker } from './api';
import { SubtaskList } from './SubtaskList';
import { DocPills } from './TaskDocs';
import { Updates } from './Updates';

export const DRAG_TYPE = 'application/x-lab-task';

export function TaskBadges({ task }: { task: Task }) {
  return (
    <span className="badges">
      {task.priority !== 'none' && <span className={`badge ${priorityClass(task.priority)}`}>{task.priority}</span>}
      <span className={`badge type-${task.task_type}`}>{task.task_type}</span>
      {task.scope !== null && (
        <span className="badge violet" title={`Scope ${task.scope}/5`}>
          S{task.scope}
        </span>
      )}
    </span>
  );
}

/** Commit pills (merged / on a branch) and linked issue / PR pills. */
export function GithubPills({ task }: { task: Task }) {
  const merged = task.commits.filter((c) => c.merged).length;
  const unmerged = task.commits.length - merged;
  return (
    <>
      {merged > 0 && (
        <span className="badge ok" title={`${merged} linked commit${merged === 1 ? '' : 's'} merged to the default branch`}>
          {merged}✓
        </span>
      )}
      {unmerged > 0 && (
        <span className="badge warn" title={`${unmerged} linked commit${unmerged === 1 ? '' : 's'} on a branch (not merged)`}>
          {unmerged}●
        </span>
      )}
      {task.links.map((l) => (
        <a
          key={l.id}
          className={`badge ${l.merged ? 'merged' : l.state === 'open' ? 'open' : 'closed'}`}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          title={`${l.kind === 'pr' ? 'Pull request' : 'Issue'} ${l.repo}#${l.number}: ${l.title} (${l.merged ? 'merged' : l.state})`}
          onClick={(e) => e.stopPropagation()}
        >
          {l.kind === 'pr' ? '⇄' : '◎'} #{l.number}
        </a>
      ))}
    </>
  );
}

interface TaskCardProps {
  task: Task;
  /** The board row / person this card is shown for. When they don't own the task, they're here because of a subtask. */
  viewer?: string;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}

export function TaskCard({ task, viewer, draggable, onDragStart, onDragEnd }: TaskCardProps) {
  const { firstName, onTaskChanged, openTask, reload, notify } = useTracker();
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);
  const [note, setNote] = useState(task.pm_note ?? '');
  useEffect(() => setNote(task.pm_note ?? ''), [task.pm_note]);

  const shared = !!viewer && !isSame(task.assignee, viewer);
  const mine = shared ? task.subtasks.filter((s) => isSame(subtaskOwner(task, s), viewer)) : [];
  const helpers = [...new Set(task.subtasks.map((s) => s.assignee).filter((a): a is string => !!a && !isSame(a, task.assignee)))];
  const latest = task.updates[0];

  const run = async (fn: () => Promise<Task>) => {
    try {
      onTaskChanged(await fn());
    } catch (err) {
      notify(errorText(err), 'bad');
    }
  };

  const setStatus = (status: TaskStatus) => {
    if (status !== task.status) void run(() => tracker.moveTask(task.id, { status }));
  };

  const saveNote = () => {
    const next = note.trim();
    if (next !== (task.pm_note ?? '')) void run(() => tracker.patchTask(task.id, { pm_note: next || null }));
  };

  const archive = async () => {
    try {
      await tracker.setArchived([task.id], true);
      reload();
    } catch (err) {
      notify(errorText(err), 'bad');
    }
  };

  return (
    <div
      className={`task-card${task.status === 'done' ? ' is-done' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => openTask(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) openTask(task);
      }}
      tabIndex={0}
      role="button"
      aria-label={`${task.ref}: ${task.title}`}
    >
      <div className="task-card-head">
        <span className="task-title">{task.title}</span>
        <TaskBadges task={task} />
      </div>
      {shared && (
        <p className="task-shared" title="On this row because of a subtask assigned to this person">
          ↳ {mine.filter((s) => s.done).length}/{mine.length} subtask{mine.length === 1 ? '' : 's'} theirs · on{' '}
          {task.assignee ? `${firstName(task.assignee)}'s task` : 'an unassigned task'}
        </p>
      )}
      <div className="task-card-meta">
        <span className="task-ref mono">{task.ref}</span>
        {!shared && (
          <span title={helpers.length ? `Subtasks also with ${helpers.map(firstName).join(', ')}` : undefined}>
            {task.assignee ? firstName(task.assignee) : 'unassigned'}
            {helpers.length > 0 && ` +${helpers.length}`}
          </span>
        )}
        {task.subtasks.length > 0 && (
          <button
            type="button"
            className={`badge${task.subtask_done_count === task.subtasks.length ? ' ok' : ''}`}
            aria-expanded={showSubtasks}
            title={`${task.subtask_done_count} of ${task.subtasks.length} subtasks done`}
            onClick={(e) => {
              e.stopPropagation();
              setShowSubtasks((v) => !v);
            }}
          >
            ☑ {task.subtask_done_count}/{task.subtasks.length}
          </button>
        )}
        <button
          type="button"
          className={`badge${task.updates.length ? ' info' : ''}`}
          aria-expanded={showUpdates}
          title={showUpdates ? 'Hide updates' : 'Show / post updates'}
          onClick={(e) => {
            e.stopPropagation();
            setShowUpdates((v) => !v);
          }}
        >
          💬 {task.updates.length || '+'}
        </button>
        <GithubPills task={task} />
        <DocPills task={task} />
      </div>
      {showSubtasks && task.subtasks.length > 0 && (
        <div className="task-card-section">
          <SubtaskList
            compact
            subtasks={task.subtasks}
            owner={task.assignee}
            highlight={shared ? viewer : null}
            onToggle={(s, done) => run(() => tracker.patchSubtask(task.id, s.id, { done }))}
          />
        </div>
      )}
      {showUpdates ? (
        <div className="task-card-section">
          <Updates compact task={task} limit={3} onChanged={onTaskChanged} />
        </div>
      ) : (
        latest && (
          <button
            type="button"
            className="task-latest"
            title={latest.body}
            onClick={(e) => {
              e.stopPropagation();
              setShowUpdates(true);
            }}
          >
            <strong>{firstName(latest.author)}:</strong> {latest.body}
          </button>
        )
      )}
      <div className="task-card-foot" onClick={(e) => e.stopPropagation()}>
        <input
          className="task-note"
          value={note}
          placeholder="PM note…"
          aria-label="PM note"
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        {task.status === 'done' && (
          <button type="button" className="link small" onClick={() => void archive()} title="Hide this finished task from the board (kept in Archived)">
            Archive
          </button>
        )}
        <select className="status-select" value={task.status} onChange={(e) => setStatus(e.target.value as TaskStatus)} aria-label="Status">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
