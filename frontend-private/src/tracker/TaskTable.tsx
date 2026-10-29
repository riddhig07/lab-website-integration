import { formatDate } from '../format';
import type { Task, TaskStatus } from '../types';
import { errorText, STATUS_LABELS, STATUSES, tracker, useTracker } from './api';
import { SubtaskProgress } from './SubtaskList';
import { GithubPills, TaskBadges } from './TaskCard';
import { DocPills } from './TaskDocs';

interface Props {
  tasks: Task[];
  archived?: boolean;
  sprintNames: Map<string, string>;
  empty: string;
}

/** The All Tasks and Archived tabs. */
export function TaskTable({ tasks, archived, sprintNames, empty }: Props) {
  const { nameOf, firstName, openTask, onTaskChanged, reload, notify } = useTracker();

  const setStatus = async (task: Task, status: TaskStatus) => {
    try {
      onTaskChanged(await tracker.moveTask(task.id, { status }));
    } catch (err) {
      notify(errorText(err), 'bad');
    }
  };

  const restore = async (task: Task) => {
    try {
      await tracker.setArchived([task.id], false);
      reload();
    } catch (err) {
      notify(errorText(err), 'bad');
    }
  };

  if (tasks.length === 0) return <p className="muted">{empty}</p>;

  return (
    <div className="table-wrap">
      <table className="task-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Assignee</th>
            <th>Subtasks</th>
            <th>GitHub</th>
            <th>{archived ? 'Archived' : 'Status'}</th>
            <th>Sprint</th>
            <th>{archived ? '' : 'Updated'}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const helpers = [...new Set(t.subtasks.map((s) => s.assignee).filter((a): a is string => !!a && a !== t.assignee))];
            return (
              <tr key={t.id} className="clickable" onClick={() => openTask(t)}>
                <td>
                  <div className="task-table-title">
                    <span className="mono muted">{t.ref}</span> <strong>{t.title}</strong>
                  </div>
                  <TaskBadges task={t} />
                </td>
                <td>
                  {t.assignee ? nameOf(t.assignee) : <em className="muted">Unassigned</em>}
                  {helpers.length > 0 && <div className="muted small">+ {helpers.map(firstName).join(', ')}</div>}
                </td>
                <td>{t.subtasks.length ? <SubtaskProgress done={t.subtask_done_count} total={t.subtasks.length} /> : <span className="muted">—</span>}</td>
                <td>
                  <span className="badges">
                    <GithubPills task={t} />
                    <DocPills task={t} />
                  </span>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  {archived ? (
                    <span className="muted small">
                      {formatDate(t.archived_at)}
                      {t.archived_by && ` · ${firstName(t.archived_by)}`}
                    </span>
                  ) : (
                    <select className="status-select" value={t.status} onChange={(e) => void setStatus(t, e.target.value as TaskStatus)} aria-label="Status">
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="muted nowrap">{t.sprint_key ? (sprintNames.get(t.sprint_key) ?? t.sprint_key) : <em>Backlog</em>}</td>
                <td className="muted nowrap" onClick={(e) => archived && e.stopPropagation()}>
                  {archived ? (
                    <button type="button" className="secondary small" onClick={() => void restore(t)} title="Put this task back on the board">
                      Restore
                    </button>
                  ) : (
                    <span title={new Date(t.updated_at).toLocaleString()}>{formatDate(t.updated_at)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
