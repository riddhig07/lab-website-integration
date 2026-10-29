import { useState, type DragEvent } from 'react';
import { added, initials, removed } from '../format';
import type { Member, MemberStats, Task, TaskStatus } from '../types';
import { errorText, isInvolved, isSame, ROLE_LABELS, STATUS_LABELS, STATUSES, tracker, useTracker } from './api';
import { DRAG_TYPE, TaskCard } from './TaskCard';

interface Props {
  tasks: Task[];
  onAdd: (assignee: string | null, status: TaskStatus) => void;
  onEditMember: (member: Member) => void;
}

interface Drag {
  id: number;
  /** The row the card was picked up from (null: Unassigned). */
  from: string | null;
  /** Picked up from its owner's row (or Unassigned), so it may change owner. */
  canReassign: boolean;
}

interface DropTarget {
  row: string | null;
  status: TaskStatus;
  index: number;
}

/** Last-7-days GitHub activity for a member, from the tracker's commit sync. */
export function GithubChip({ stats }: { stats: MemberStats | undefined }) {
  if (!stats) return null;
  if (stats.commit_count === 0) {
    return (
      <span className="gh-chip quiet" title="No commits in the last 7 days">
        0 commits · 7d
      </span>
    );
  }
  return (
    <span
      className="gh-chip"
      title={`Last 7 days, all lab repos: ${stats.merged_count} merged + ${stats.unmerged_count} on a branch · ${added(stats.additions)} / ${removed(stats.deletions)}${
        stats.pending_line_counts ? ` (${stats.pending_line_counts} commits not counted yet)` : ''
      }`}
    >
      {stats.merged_count > 0 && <span className="ok">{stats.merged_count}✓ merged</span>}
      {stats.unmerged_count > 0 && <span className="warn">{stats.unmerged_count}● on branch</span>}
      <span>
        {added(stats.additions)}/{removed(stats.deletions)}
      </span>
    </span>
  );
}

/**
 * One row per person and a column per status. A task shows in its owner's row
 * and in the rows of anyone holding one of its subtasks. Cards drag between
 * columns (status) and, from their owner's row, between people (assignee).
 */
export function TeamBoard({ tasks, onAdd, onEditMember }: Props) {
  const { team, stats, onTaskChanged, reload, notify } = useTracker();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const members = team.filter((m) => m.active);
  const unassigned = tasks.filter((t) => !t.assignee);
  const rows: { login: string | null; member?: Member }[] = [
    ...members.map((m) => ({ login: m.github_login, member: m })),
    // Unassigned work gets a row when there is some (or while dragging, to unassign).
    ...(unassigned.length > 0 || drag?.canReassign ? [{ login: null }] : []),
  ];

  const rowTasks = (login: string | null) =>
    login === null
      ? unassigned
      : tasks
          .filter((t) => isInvolved(t, login))
          // Their own tasks first, then ones they only hold a subtask on.
          .sort((a, b) => Number(!isSame(a.assignee, login)) - Number(!isSame(b.assignee, login)));

  const doneOnBoard = tasks.filter((t) => t.status === 'done' && rows.some((r) => (r.login === null ? !t.assignee : isInvolved(t, r.login))));

  const archiveDone = async () => {
    const n = doneOnBoard.length;
    if (!window.confirm(`Archive ${n} done task${n === 1 ? '' : 's'}? They move to the Archived tab.`)) return;
    try {
      await tracker.setArchived(
        doneOnBoard.map((t) => t.id),
        true,
      );
      reload();
    } catch (err) {
      notify(errorText(err), 'bad');
    }
  };

  const allowed = (row: string | null) => !!drag && (drag.canReassign || drag.from === row);

  const onDragOver = (e: DragEvent<HTMLDivElement>, row: string | null, status: TaskStatus) => {
    if (!allowed(row)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Insert before the first card whose middle is below the pointer.
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-task-id]')].filter((el) => Number(el.dataset.taskId) !== drag!.id);
    let index = cards.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (index < 0) index = cards.length;
    if (!target || target.row !== row || target.status !== status || target.index !== index) setTarget({ row, status, index });
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>, row: string | null, status: TaskStatus) => {
    e.preventDefault();
    const d = drag;
    const t = target;
    setDrag(null);
    setTarget(null);
    if (!d || !t) return;
    const task = tasks.find((x) => x.id === d.id);
    if (!task) return;

    const lane = rowTasks(row).filter((x) => x.status === status && x.id !== d.id);
    const before = lane[t.index - 1]?.position;
    const after = lane[t.index]?.position;
    const position =
      before !== undefined && after !== undefined ? (before + after) / 2 : before !== undefined ? before + 1 : after !== undefined ? after - 1 : task.position;
    const body: { status?: TaskStatus; assignee?: string | null; position: number } = { position };
    if (status !== task.status) body.status = status;
    if (d.canReassign && row !== d.from && !isSame(row, task.assignee)) body.assignee = row;
    if (body.status === undefined && body.assignee === undefined && position === task.position) return;

    // Show the move right away; the server's copy replaces it.
    onTaskChanged({ ...task, ...body, status: body.status ?? task.status, assignee: body.assignee !== undefined ? body.assignee : task.assignee });
    try {
      onTaskChanged(await tracker.moveTask(task.id, body));
    } catch (err) {
      notify(errorText(err), 'bad');
      reload();
    }
  };

  return (
    <div className="board" onDragEnd={() => (setDrag(null), setTarget(null))}>
      <div className="board-head">
        <div />
        {STATUSES.map((s) => (
          <div key={s} className="board-head-cell">
            <span>{STATUS_LABELS[s]}</span>
            {s === 'done' && doneOnBoard.length > 0 && (
              <button type="button" className="link small" onClick={() => void archiveDone()} title="Archive every done task shown on the board">
                Archive all ({doneOnBoard.length})
              </button>
            )}
          </div>
        ))}
      </div>
      {rows.map(({ login, member }) => {
        const own = rowTasks(login);
        return (
          <div key={login ?? '(unassigned)'} className={`board-row${drag && !allowed(login) ? ' no-drop' : ''}`}>
            <div className="board-person">
              {member ? (
                <button type="button" className="board-person-name" onClick={() => onEditMember(member)} title="Edit member">
                  <span className="avatar">{initials(member.name)}</span>
                  <span className="truncate">
                    <strong>{member.name}</strong>
                    <span className="muted small">
                      {ROLE_LABELS[member.role]} · @{member.github_login}
                    </span>
                  </span>
                </button>
              ) : (
                <div className="board-person-name">
                  <span className="avatar">?</span>
                  <span>
                    <strong>Unassigned</strong>
                    <span className="muted small">Drag a card onto someone to assign it</span>
                  </span>
                </div>
              )}
              {member && <GithubChip stats={stats.get(member.github_login.toLowerCase())} />}
            </div>
            {STATUSES.map((s) => {
              const lane = own.filter((t) => t.status === s);
              const active = target && target.row === login && target.status === s;
              return (
                <div
                  key={s}
                  className={`board-lane${active ? ' drop-target' : ''}`}
                  onDragOver={(e) => onDragOver(e, login, s)}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setTarget(null);
                  }}
                  onDrop={(e) => void onDrop(e, login, s)}
                >
                  <div className="board-lane-label">
                    {STATUS_LABELS[s]} · {lane.length}
                  </div>
                  {lane.map((t, i) => (
                    <div key={t.id} data-task-id={t.id} className={drag?.id === t.id ? 'dragging' : undefined}>
                      {active && target.index === i && drag?.id !== t.id && <div className="drop-line" />}
                      <TaskCard
                        task={t}
                        viewer={login ?? undefined}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(DRAG_TYPE, String(t.id));
                          e.dataTransfer.effectAllowed = 'move';
                          setDrag({ id: t.id, from: login, canReassign: login === null || isSame(t.assignee, login) });
                        }}
                        onDragEnd={() => (setDrag(null), setTarget(null))}
                      />
                    </div>
                  ))}
                  {active && target.index >= lane.filter((t) => t.id !== drag?.id).length && <div className="drop-line" />}
                  <button type="button" className="lane-add" onClick={() => onAdd(login, s)}>
                    + Add
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
      {doneOnBoard.length > 0 && (
        <button type="button" className="secondary board-archive-mobile" onClick={() => void archiveDone()}>
          Archive all done ({doneOnBoard.length})
        </button>
      )}
    </div>
  );
}
