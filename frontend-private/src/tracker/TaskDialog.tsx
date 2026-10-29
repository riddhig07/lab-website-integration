import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { Dialog } from '../Dialog';
import { formatDate, timeAgo } from '../format';
import { Markdown } from '../Markdown';
import type { CurrentSprint, RepoSummary, Subtask, Task, TaskPriority, TaskStatus, TaskType } from '../types';
import { errorText, NON_CODE_TYPES, PRIORITIES, SCOPES, STATUS_LABELS, STATUSES, TASK_TYPES, tracker, useTracker, type TaskInput } from './api';
import { SubtaskList, SubtaskProgress } from './SubtaskList';
import { Updates } from './Updates';

interface Props {
  open: boolean;
  onClose: () => void;
  /** The task to edit, or null for a new one. */
  task: Task | null;
  defaults: { assignee: string | null; status: TaskStatus; sprint_key: string | null };
  currentSprint: CurrentSprint | null;
  sprintNames: Map<string, string>;
}

type DraftSubtask = Pick<Subtask, 'id' | 'title' | 'assignee' | 'done'> & Partial<Subtask>;

export function TaskDialog({ open, onClose, task, defaults, currentSprint, sprintNames }: Props) {
  const { config, team, firstName, onTaskChanged, reload } = useTracker();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('research');
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [scope, setScope] = useState('');
  const [sprintKey, setSprintKey] = useState('');
  // New tasks keep subtasks locally until created; existing tasks save each change.
  const [subtasks, setSubtasks] = useState<DraftSubtask[]>([]);
  // The latest server copy of an existing task (subtask, update and link calls return it).
  const [current, setCurrent] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setPreview(!!task?.description);
    setAssignee(task ? (task.assignee ?? '') : (defaults.assignee ?? ''));
    setTaskType(task?.task_type ?? 'research');
    setPriority(task?.priority ?? 'none');
    setStatus(task?.status ?? defaults.status);
    setScope(task?.scope ? String(task.scope) : '');
    setSprintKey(task ? (task.sprint_key ?? '') : (defaults.sprint_key ?? ''));
    setSubtasks(task?.subtasks ?? []);
    setCurrent(task);
    setError(null);
    // Only when the dialog opens or switches task, not on every refresh of it.
  }, [open, task?.id]);

  // Saved immediately: keep the board in step without resetting the form.
  const applyServer = (t: Task) => {
    setCurrent(t);
    setSubtasks(t.subtasks);
    onTaskChanged(t);
  };

  const fields = (): TaskInput => ({
    title: title.trim(),
    description: description.trim() || null,
    assignee: assignee || null,
    task_type: taskType,
    priority,
    status,
    scope: scope ? Number(scope) : null,
    sprint_key: sprintKey || null,
  });

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (task) onTaskChanged(await tracker.patchTask(task.id, fields()));
      else {
        onTaskChanged(await tracker.createTask({ ...fields(), subtasks: subtasks.map((s) => ({ title: s.title, assignee: s.assignee })) }));
      }
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!task || !window.confirm(`Delete ${task.ref} “${task.title}”? This can't be undone.`)) return;
    setSaving(true);
    try {
      await tracker.deleteTask(task.id);
      reload();
      onClose();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  // Archiving saves pending edits first so they aren't lost when the dialog closes.
  const toggleArchive = async () => {
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      if (!task.archived) await tracker.patchTask(task.id, fields());
      await tracker.setArchived([task.id], !task.archived);
      reload();
      onClose();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  const members = team.filter((m) => m.active || m.github_login === task?.assignee);
  const sprintOptions = [
    ...(currentSprint ? [{ key: currentSprint.key, label: `${currentSprint.label} (current)` }] : []),
    ...(sprintKey && sprintKey !== currentSprint?.key ? [{ key: sprintKey, label: `${sprintNames.get(sprintKey) ?? sprintKey} (past)` }] : []),
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title={task ? `${task.ref} · Edit task` : 'New task'}
      subtitle={
        task?.archived
          ? `Archived ${formatDate(task.archived_at)}${task.archived_by ? ` by ${firstName(task.archived_by)}` : ''}. Changing the status away from done puts it back on the board.`
          : task
            ? `Created ${timeAgo(task.created_at)} by ${firstName(task.created_by)} · mention ${task.ref} in a commit message to link it`
            : undefined
      }
      footer={
        <>
          <div className="button-row">
            {task && config.me.is_admin && (
              <button type="button" className="link danger" onClick={() => void remove()} disabled={saving}>
                Delete
              </button>
            )}
            {task && (task.archived || status === 'done') && (
              <button type="button" className="secondary" onClick={() => void toggleArchive()} disabled={saving}>
                {task.archived ? 'Restore' : 'Archive'}
              </button>
            )}
          </div>
          <div className="button-row">
            <button type="button" className="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="task-form" disabled={saving}>
              {saving ? 'Saving…' : task ? 'Save' : 'Create'}
            </button>
          </div>
        </>
      }
    >
      <form id="task-form" onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="task-title">Title</label>
          <input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required autoFocus={!task} />
        </div>
        <div className="field">
          <div className="field-label-row">
            <label htmlFor="task-desc">Description</label>
            {description.trim() && (
              <button type="button" className="link small" onClick={() => setPreview((p) => !p)}>
                {preview ? 'Edit' : 'Preview'}
              </button>
            )}
          </div>
          {preview && description.trim() ? (
            <div className="description-preview" onDoubleClick={() => setPreview(false)}>
              <Markdown text={description} />
            </div>
          ) : (
            <textarea id="task-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Markdown supported" />
          )}
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="task-assignee">Assignee</label>
            <select id="task-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.github_login}>
                  {m.name} (@{m.github_login})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-sprint">Sprint</label>
            <select id="task-sprint" value={sprintKey} onChange={(e) => setSprintKey(e.target.value)}>
              <option value="">Backlog (not scheduled)</option>
              {sprintOptions.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row four">
          <div className="field">
            <label htmlFor="task-status">Status</label>
            <select id="task-status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-type">Type</label>
            <select id="task-type" value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType)}>
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-priority">Priority</label>
            <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p === 'none' ? '—' : p}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-scope">Scope</label>
            <select id="task-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">—</option>
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>

      <div className="section-label">
        Subtasks <SubtaskProgress done={subtasks.filter((s) => s.done).length} total={subtasks.length} />
      </div>
      <div className="subtask-box">
        <SubtaskList
          subtasks={subtasks as Subtask[]}
          owner={assignee || null}
          onToggle={async (s, done) => {
            if (!task) setSubtasks((prev) => prev.map((x) => (x.id === s.id ? { ...x, done } : x)));
            else applyServer(await tracker.patchSubtask(task.id, s.id, { done }));
          }}
          onAssign={async (s, who) => {
            if (!task) setSubtasks((prev) => prev.map((x) => (x.id === s.id ? { ...x, assignee: who } : x)));
            else applyServer(await tracker.patchSubtask(task.id, s.id, { assignee: who }));
          }}
          onAdd={async (t, who) => {
            if (!task) setSubtasks((prev) => [...prev, { id: -Date.now(), title: t, assignee: who, done: false }]);
            else applyServer(await tracker.addSubtask(task.id, t, who));
          }}
          onDelete={async (s) => {
            if (!task) setSubtasks((prev) => prev.filter((x) => x.id !== s.id));
            else applyServer(await tracker.deleteSubtask(task.id, s.id));
          }}
        />
      </div>
      <p className="muted small">
        Give a subtask its own assignee to split the task; it shows on their board row too.{task && ' Subtask changes save immediately.'}
      </p>

      {current && (
        <>
          <div className="section-label">
            Updates {current.updates.length > 0 && <span className="muted small">{current.updates.length}</span>}
          </div>
          <Updates task={current} onChanged={applyServer} />
          {config.github_enabled && <GithubSection task={current} codeTask={!NON_CODE_TYPES.has(taskType)} onChanged={applyServer} />}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </Dialog>
  );
}

function GithubSection({ task, codeTask, onChanged }: { task: Task; codeTask: boolean; onChanged: (t: Task) => void }) {
  const { firstName } = useTracker();
  const [url, setUrl] = useState('');
  const [repos, setRepos] = useState<RepoSummary[] | null>(null);
  const [repo, setRepo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<RepoSummary[]>('/internal/github/repos')
      .then((r) => {
        const live = r.filter((x) => !x.archived);
        setRepos(live);
        setRepo((cur) => cur || live[0]?.full_name || '');
      })
      .catch(() => setRepos([]));
  }, []);

  const run = async (fn: () => Promise<Task>) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await fn());
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const link = async () => {
    if (url.trim() && (await run(() => tracker.linkIssue(task.id, url.trim())))) setUrl('');
  };

  const createIssue = async () => {
    if (!repo) return;
    if (!window.confirm(`Open a GitHub issue for ${task.ref} in ${repo}? Everyone in the lab's GitHub can see it.`)) return;
    await run(() => tracker.createIssue(task.id, repo));
  };

  const merged = task.commits.filter((c) => c.merged);
  const onBranch = task.commits.filter((c) => !c.merged);

  return (
    <>
      <div className="section-label">GitHub</div>
      <div className="github-box">
        {task.links.length > 0 && (
          <ul className="link-list">
            {task.links.map((l) => (
              <li key={l.id}>
                <span className={`badge ${l.merged ? 'merged' : l.state === 'open' ? 'open' : 'closed'}`}>
                  {l.kind === 'pr' ? 'PR' : 'Issue'} · {l.merged ? 'merged' : l.state}
                </span>
                <a href={l.url} target="_blank" rel="noreferrer" className="truncate">
                  {l.repo.split('/')[1]}#{l.number} {l.title}
                </a>
                <button type="button" className="link icon" onClick={() => void run(() => tracker.unlinkIssue(task.id, l.id))} aria-label={`Unlink #${l.number}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="inline-form">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste an issue or PR URL (or owner/repo#12)"
            aria-label="Issue or pull request to link"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void link();
              }
            }}
          />
          <button type="button" className="secondary small" onClick={() => void link()} disabled={busy || !url.trim()}>
            Link
          </button>
        </div>
        {repos && repos.length > 0 && (
          <div className="inline-form">
            <select value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="Repository for a new issue">
              {repos.map((r) => (
                <option key={r.full_name} value={r.full_name}>
                  {r.full_name}
                </option>
              ))}
            </select>
            <button type="button" className="secondary small" onClick={() => void createIssue()} disabled={busy || !repo}>
              Create issue
            </button>
          </div>
        )}
        <p className="muted small">Closing a linked issue on GitHub marks this task done at the next sync.</p>
        {error && <p className="error small">{error}</p>}

        {task.commits.length > 0 ? (
          <div className="commit-box">
            <div className="small">
              <strong>Linked commits ({task.commits.length})</strong>{' '}
              {task.commit_authors.map((a) => (
                <span key={a.login ?? a.name} className="muted">
                  · {a.login ? firstName(a.login) : a.name}: {a.merged > 0 && <span className="ok-text">{a.merged} merged</span>}
                  {a.merged > 0 && a.unmerged > 0 && ', '}
                  {a.unmerged > 0 && <span className="warn-text">{a.unmerged} on a branch</span>}{' '}
                </span>
              ))}
            </div>
            {[
              ['Merged', merged, 'ok'] as const,
              ['On a branch', onBranch, 'warn'] as const,
            ].map(([label, list, cls]) =>
              list.length ? (
                <div key={label}>
                  <div className={`commit-group ${cls}-text`}>
                    {label} ({list.length})
                  </div>
                  <ul className="commit-list">
                    {list.slice(0, 20).map((c) => (
                      <li key={`${c.repo}:${c.sha}`}>
                        <span className={`dot ${cls}`} />
                        <a className="mono" href={c.url} target="_blank" rel="noreferrer">
                          {c.sha.slice(0, 7)}
                        </a>
                        <span className="truncate" title={c.message}>
                          {c.message.split('\n')[0]}
                        </span>
                        <span className="muted small nowrap">
                          {c.repo.split('/')[1]} · {c.author_login ? firstName(c.author_login) : c.author_name} · {timeAgo(c.authored_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        ) : (
          <p className="muted small">
            No linked commits yet.{' '}
            {codeTask
              ? `Commits mentioning ${task.ref}, a linked issue's #number, or this task's title link automatically.`
              : `Commits mentioning ${task.ref} link automatically.`}
          </p>
        )}
      </div>
    </>
  );
}
