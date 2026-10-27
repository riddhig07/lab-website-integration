import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '../auth';
import type { CurrentSprint, Member, MemberStats, SprintInfo, Task, TaskPriority, TaskStatus, TaskType, TrackerConfig } from '../types';
import { AiChat } from './AiChat';
import {
  byPriority,
  errorText,
  PRIORITIES,
  SCOPES,
  STATUS_LABELS,
  STATUSES,
  TASK_TYPES,
  tracker,
  TrackerContext,
  type PlanResult,
  type TrackerContextValue,
} from './api';
import { ByPerson } from './ByPerson';
import { MemberDialog } from './MemberDialog';
import { OverallTab } from './OverallTab';
import { SprintPlanner } from './SprintPlanner';
import { SprintsTab, Tile } from './SprintsTab';
import { TaskDialog } from './TaskDialog';
import { TaskTable } from './TaskTable';
import { TeamBoard } from './TeamBoard';
import './tracker.css';

const TABS = [
  ['board', 'Team Board'],
  ['person', 'By Person'],
  ['list', 'All Tasks'],
  ['archived', 'Archived'],
  ['sprints', 'Sprints'],
  ['overall', 'Overall'],
] as const;
type Tab = (typeof TABS)[number][0];

const SPRINT_FILTER_KEY = 'tracker.sprintFilter';
const REFRESH_MS = 60_000;

function storedSprintFilter(): string {
  try {
    return localStorage.getItem(SPRINT_FILTER_KEY) || 'current';
  } catch {
    return 'current';
  }
}

/**
 * /tracker: the lab's task board, modelled on SmartBrowse's story tracker.
 * Tasks are planned in weekly sprints, split into subtasks, discussed through
 * updates, and linked to GitHub issues, pull requests and commits.
 */
export function TrackerPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'board') as Tab;
  const taskParam = Number(params.get('task')) || null;

  const [config, setConfig] = useState<TrackerConfig | null>(null);
  const [team, setTeam] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [archived, setArchived] = useState<Task[] | null>(null);
  const [current, setCurrent] = useState<CurrentSprint | null>(null);
  const [sprints, setSprints] = useState<SprintInfo[]>([]);
  const [stats, setStats] = useState<Map<string, MemberStats>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; kind: 'ok' | 'bad' } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [sprintFilter, setSprintFilterState] = useState(storedSprintFilter);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TaskType | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');
  const [scopeFilter, setScopeFilter] = useState('');

  const [dialogTask, setDialogTask] = useState<Task | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [newDefaults, setNewDefaults] = useState<{ assignee: string | null; status: TaskStatus }>({ assignee: null, status: 'todo' });
  const [memberDialog, setMemberDialog] = useState<{ open: boolean; member: Member | null }>({ open: false, member: null });
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const setSprintFilter = (v: string) => {
    setSprintFilterState(v);
    try {
      localStorage.setItem(SPRINT_FILTER_KEY, v);
    } catch {
      // A per-viewer convenience only.
    }
  };

  const setTab = (t: Tab) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (t === 'board') next.delete('tab');
      else next.set('tab', t);
      return next;
    });

  const notify = useCallback((message: string, kind: 'ok' | 'bad' = 'ok') => setNotice({ message, kind }), []);

  const loadTasks = useCallback(() => {
    tracker
      .tasks()
      .then(setTasks)
      .catch((e) => setError(errorText(e)));
  }, []);

  const loadArchived = useCallback(() => {
    tracker
      .tasks({ archived: true })
      .then(setArchived)
      .catch((e) => setError(errorText(e)));
  }, []);

  const loadSprints = useCallback(() => {
    tracker.currentSprint().then(setCurrent).catch(() => undefined);
    tracker.sprints().then(setSprints).catch(() => undefined);
  }, []);

  const loadTeam = useCallback(() => {
    tracker.team().then(setTeam).catch((e) => setError(errorText(e)));
    tracker
      .memberStats()
      .then((list) => setStats(new Map(list.map((s) => [s.login.toLowerCase(), s]))))
      .catch(() => undefined);
  }, []);

  const reload = useCallback(() => {
    loadTasks();
    if (archived) loadArchived();
    loadSprints();
  }, [loadTasks, loadArchived, loadSprints, archived]);

  useEffect(() => {
    tracker.config().then(setConfig).catch((e) => setError(errorText(e)));
    loadTeam();
    loadTasks();
    loadSprints();
  }, [loadTeam, loadTasks, loadSprints]);

  useEffect(() => {
    if ((tab === 'archived' || tab === 'sprints') && !archived) loadArchived();
  }, [tab, archived, loadArchived]);

  // Keep the board current while people work on it together.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && !taskDialogOpen) loadTasks();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadTasks, taskDialogOpen]);

  // Open the planner once per sprint per browser session, the first time the
  // board loads after a sprint ends; closing it ("Later") snoozes it.
  useEffect(() => {
    if (!current?.planning_needed) return;
    const key = `tracker.planPrompted.${current.key}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // No storage: show it anyway.
    }
    setPlannerOpen(true);
  }, [current?.key, current?.planning_needed]);

  // ?task=12 opens that task (links from GitHub issues, Slack and commits).
  useEffect(() => {
    if (!taskParam || !tasks) return;
    const found = tasks.find((t) => t.id === taskParam) ?? archived?.find((t) => t.id === taskParam);
    if (found) {
      setDialogTask(found);
      setTaskDialogOpen(true);
    } else {
      tracker
        .task(taskParam)
        .then((t) => {
          setDialogTask(t);
          setTaskDialogOpen(true);
        })
        .catch((e) => notify(errorText(e), 'bad'));
    }
    // Opens once per id; later list refreshes shouldn't reopen it.
  }, [taskParam, tasks === null]);

  const onTaskChanged = useCallback((task: Task) => {
    const upsert = (list: Task[] | null, include: boolean) => {
      if (!list) return list;
      const rest = list.filter((t) => t.id !== task.id);
      if (!include) return rest;
      const i = list.findIndex((t) => t.id === task.id);
      if (i < 0) return [task, ...rest];
      const copy = [...list];
      copy[i] = task;
      return copy;
    };
    setTasks((list) => upsert(list, !task.archived));
    setArchived((list) => upsert(list, task.archived));
    setDialogTask((d) => (d?.id === task.id ? task : d));
  }, []);

  const openTask = useCallback(
    (t: Task | number) => {
      const task = typeof t === 'number' ? (tasks?.find((x) => x.id === t) ?? archived?.find((x) => x.id === t)) : t;
      if (task) {
        setDialogTask(task);
        setTaskDialogOpen(true);
      } else if (typeof t === 'number') {
        tracker
          .task(t)
          .then((x) => {
            setDialogTask(x);
            setTaskDialogOpen(true);
          })
          .catch((e) => notify(errorText(e), 'bad'));
      }
    },
    [tasks, archived, notify],
  );

  const closeTask = () => {
    setTaskDialogOpen(false);
    if (taskParam)
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.delete('task');
        return next;
      });
  };

  const openNewTask = (assignee: string | null = null, status: TaskStatus = 'todo') => {
    setDialogTask(null);
    setNewDefaults({ assignee, status });
    setTaskDialogOpen(true);
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await tracker.sync(true);
      const parts = [
        `${r.repos_scanned} repo${r.repos_scanned === 1 ? '' : 's'} scanned`,
        `${r.commits_seen} recent commits`,
        r.links_added && `${r.links_added} new commit link${r.links_added === 1 ? '' : 's'}`,
        r.links_refreshed && `${r.links_refreshed} issue/PR states refreshed`,
        r.tasks_completed && `${r.tasks_completed} task${r.tasks_completed === 1 ? '' : 's'} done via closed issues`,
        r.members_added && `${r.members_added} new member${r.members_added === 1 ? '' : 's'}`,
      ].filter(Boolean);
      notify(r.errors.length ? `Synced with errors: ${r.errors.join('; ')}` : `Synced from GitHub: ${parts.join(', ')}.`, r.errors.length ? 'bad' : 'ok');
      loadTeam();
      reload();
    } catch (err) {
      notify(errorText(err), 'bad');
    } finally {
      setSyncing(false);
    }
  };

  const onPlanned = (r: PlanResult) => {
    const parts = [
      r.carried_over && `${r.carried_over} carried over`,
      r.picked_up && `${r.picked_up} picked up`,
      r.created.length && `${r.created.length} new`,
      r.returned_to_backlog && `${r.returned_to_backlog} back to the backlog`,
    ].filter(Boolean);
    notify(`Sprint planned${parts.length ? `: ${parts.join(', ')}` : ''}.`);
    setSprintFilter('current');
    reload();
  };

  const nameMap = useMemo(() => new Map(team.map((m) => [m.github_login.toLowerCase(), m.name])), [team]);
  const ctx: TrackerContextValue | null = config && {
    config,
    team,
    stats,
    nameOf: (login) => (login ? (nameMap.get(login.toLowerCase()) ?? login) : 'unassigned'),
    firstName: (login) => (login ? (nameMap.get(login.toLowerCase())?.split(' ')[0] ?? login) : 'unassigned'),
    onTaskChanged,
    reload,
    openTask,
    notify,
  };

  const sprintNames = useMemo(() => new Map(sprints.map((s) => [s.key, s.label.split(' · ')[0]])), [sprints]);
  const all = tasks ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((t) => {
      if (sprintFilter === 'backlog') {
        if (t.sprint_key) return false;
      } else if (sprintFilter === 'current') {
        if (current && t.sprint_key !== current.key) return false;
      } else if (sprintFilter !== 'all' && !t.sprint_keys.includes(sprintFilter)) return false;
      if (typeFilter && t.task_type !== typeFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (scopeFilter && String(t.scope ?? 'none') !== scopeFilter) return false;
      if (q && !`${t.ref} ${t.title} ${t.description ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, sprintFilter, current, typeFilter, priorityFilter, statusFilter, scopeFilter, query]);

  const filteredArchived = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (archived ?? []).filter((t) => !q || `${t.ref} ${t.title} ${t.description ?? ''}`.toLowerCase().includes(q));
  }, [archived, query]);

  const open = all.filter((t) => t.status !== 'done');
  const activeTeam = team.filter((m) => m.active);
  const filterCount = [typeFilter, priorityFilter, statusFilter, scopeFilter].filter(Boolean).length;
  const me = config?.me.member;
  // New tasks land in the sprint the board shows; the backlog view makes backlog tasks.
  const defaultSprint = sprintFilter === 'backlog' ? null : (current?.key ?? null);

  return (
    <div className="page-wide tracker">
      <div className="page-header">
        <div>
          <h1>Task Board</h1>
          <p className="muted">
            {current ? `${current.label} · ` : ''}Weekly sprints, linked to the lab's GitHub issues, pull requests and commits.
          </p>
        </div>
        {config && (
          <div className="button-row">
            {config.github_enabled && (
              <button type="button" className="secondary" onClick={() => void sync()} disabled={syncing} title="Pull members, commits and issue states from GitHub now">
                {syncing ? 'Syncing…' : 'Sync from GitHub'}
              </button>
            )}
            <button type="button" className="secondary" onClick={() => setMemberDialog({ open: true, member: null })}>
              + Member
            </button>
            {config.ai_enabled && (
              <button type="button" className="secondary" onClick={() => setAiOpen(true)}>
                ✨ Ask Gemini
              </button>
            )}
            {current?.member && (
              <button type="button" className="secondary" onClick={() => setPlannerOpen(true)} title="Review last sprint and choose what you're taking on">
                📋 Plan sprint{current.planning_needed && <span className="dot-indicator" aria-label="not planned yet" />}
              </button>
            )}
            <button type="button" onClick={() => openNewTask(me?.github_login ?? null)}>
              + New task
            </button>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {notice && (
        <div className={`notice ${notice.kind}`} role="status">
          <span>{notice.message}</span>
          <button type="button" className="link small" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {config && !me && user?.github_login && !error && (
        <div className="notice">
          <span>
            You're not on the task board's team yet, so you can't be assigned work or plan sprints.{' '}
            {config.github_enabled ? 'Everyone in the GitHub organization is added when it syncs, or add yourself.' : 'Add yourself as a member.'}
          </span>
          <button type="button" className="small" onClick={() => setMemberDialog({ open: true, member: null })}>
            Add me
          </button>
        </div>
      )}

      {!ctx || !tasks ? (
        !error && <p className="muted">Loading…</p>
      ) : (
        <TrackerContext.Provider value={ctx}>
          <div className="tiles">
            <Tile label="Open tasks" value={open.length} />
            <Tile label="Open P0" value={open.filter((t) => t.priority === 'P0').length} tone={open.some((t) => t.priority === 'P0') ? 'p0' : undefined} />
            <Tile label="Open P1" value={open.filter((t) => t.priority === 'P1').length} tone={open.some((t) => t.priority === 'P1') ? 'p1' : undefined} />
            <Tile label="Backlog" value={open.filter((t) => !t.sprint_key).length} />
            <Tile label="Team" value={activeTeam.length} />
          </div>

          <div className="tabs" role="tablist">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {tab !== 'sprints' && tab !== 'overall' && (
            <div className="toolbar">
              {tab !== 'archived' && (
                <select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)} aria-label="Sprint">
                  <option value="current">{current ? `${current.label.split(' · ')[0]} (current)` : 'Current sprint'}</option>
                  <option value="backlog">Backlog (no sprint)</option>
                  <option value="all">All sprints</option>
                  {sprints
                    .filter((s) => s.key !== current?.key)
                    .map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                </select>
              )}
              <input type="search" placeholder="Search T-12, title or description…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tasks" />
              {tab !== 'archived' && (
                <details className="filter-menu">
                  <summary className="button secondary">Filter{filterCount > 0 && <span className="count">{filterCount}</span>}</summary>
                  <div className="filter-panel">
                    <label>
                      Type
                      <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TaskType | '')}>
                        <option value="">All types</option>
                        {TASK_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Priority
                      <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | '')}>
                        <option value="">All priorities</option>
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p === 'none' ? '— (no priority)' : p}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Status
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | '')}>
                        <option value="">All statuses</option>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Scope
                      <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}>
                        <option value="">All scopes</option>
                        <option value="none">— (no scope)</option>
                        {SCOPES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    {filterCount > 0 && (
                      <button
                        type="button"
                        className="link small"
                        onClick={() => {
                          setTypeFilter('');
                          setPriorityFilter('');
                          setStatusFilter('');
                          setScopeFilter('');
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}

          {tab === 'board' &&
            (activeTeam.length === 0 ? (
              <div className="panel center">
                <p className="muted">No team members yet. {config?.github_enabled && 'Sync from GitHub to add everyone in the organization, or add people by hand.'}</p>
                <button type="button" onClick={() => setMemberDialog({ open: true, member: null })}>
                  + Add team member
                </button>
              </div>
            ) : (
              <TeamBoard tasks={filtered} onAdd={openNewTask} onEditMember={(m) => setMemberDialog({ open: true, member: m })} />
            ))}
          {tab === 'person' && <ByPerson tasks={filtered} onAdd={openNewTask} onEditMember={(m) => setMemberDialog({ open: true, member: m })} />}
          {tab === 'list' && <TaskTable tasks={[...filtered].sort(byPriority)} sprintNames={sprintNames} empty="No tasks match the current filters." />}
          {tab === 'archived' &&
            (archived ? (
              <TaskTable
                archived
                tasks={filteredArchived}
                sprintNames={sprintNames}
                empty={query.trim() ? 'No archived tasks match your search.' : 'No archived tasks. Archive done tasks from the board to tidy it up.'}
              />
            ) : (
              <p className="muted">Loading…</p>
            ))}
          {tab === 'sprints' && <SprintsTab sprints={sprints} currentKey={current?.key ?? null} />}
          {tab === 'overall' && <OverallTab />}

          <TaskDialog
            open={taskDialogOpen}
            onClose={closeTask}
            task={dialogTask}
            defaults={{ ...newDefaults, sprint_key: defaultSprint }}
            currentSprint={current}
            sprintNames={sprintNames}
          />
          <MemberDialog
            open={memberDialog.open}
            member={memberDialog.member}
            prefill={!me && user?.github_login ? { github_login: user.github_login, name: user.name } : null}
            onClose={() => setMemberDialog({ open: false, member: null })}
            onSaved={() => {
              loadTeam();
              tracker.config().then(setConfig).catch(() => undefined);
              loadSprints();
            }}
          />
          <SprintPlanner open={plannerOpen} onClose={() => setPlannerOpen(false)} onPlanned={onPlanned} />
          {config?.ai_enabled && (
            <AiChat
              open={aiOpen}
              onClose={() => setAiOpen(false)}
              onChanged={() => {
                reload();
                loadTeam();
              }}
            />
          )}
        </TrackerContext.Provider>
      )}
    </div>
  );
}
