import { createContext, useContext } from 'react';
import { api } from '../api';
import type {
  CurrentSprint,
  Member,
  MemberStats,
  OverallStats,
  PersonalSummary,
  SprintInfo,
  SprintPlanning,
  SprintSummary,
  SlackUser,
  SyncResult,
  Task,
  TaskPriority,
  TaskStatus,
  TaskType,
  TrackerConfig,
} from '../types';

// Calls to /api/internal/tracker, plus the labels and helpers the board shares.

const base = '/internal/tracker';

export interface TaskInput {
  title?: string;
  description?: string | null;
  assignee?: string | null;
  task_type?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  scope?: number | null;
  pm_note?: string | null;
  /** A sprint key, 'current', or null for the backlog. */
  sprint_key?: string | null;
}

export interface PlanResult {
  sprint: string;
  carried_over: number;
  returned_to_backlog: number;
  picked_up: number;
  created: number[];
}

export const tracker = {
  config: () => api<TrackerConfig>(`${base}/config`),

  team: () => api<Member[]>(`${base}/team`),
  addMember: (body: Partial<Member>) => api<Member>(`${base}/team`, { method: 'POST', body }),
  updateMember: (id: number, body: Partial<Member>) => api<Member>(`${base}/team/${id}`, { method: 'PATCH', body }),
  deactivateMember: (id: number) => api<void>(`${base}/team/${id}`, { method: 'DELETE' }),
  slackUsers: () => api<SlackUser[]>(`${base}/slack-users`),

  tasks: (params: { archived?: boolean } = {}) => api<Task[]>(`${base}/tasks${params.archived ? '?archived=true' : ''}`),
  task: (id: number) => api<Task>(`${base}/tasks/${id}`),
  createTask: (body: TaskInput & { subtasks?: { title: string; assignee: string | null }[] }) =>
    api<Task>(`${base}/tasks`, { method: 'POST', body }),
  patchTask: (id: number, body: TaskInput) => api<Task>(`${base}/tasks/${id}`, { method: 'PATCH', body }),
  moveTask: (id: number, body: { status?: TaskStatus; assignee?: string | null; position?: number }) =>
    api<Task>(`${base}/tasks/${id}/move`, { method: 'POST', body }),
  deleteTask: (id: number) => api<void>(`${base}/tasks/${id}`, { method: 'DELETE' }),
  setArchived: (ids: number[], archived: boolean) =>
    api<{ updated: number; skipped: number }>(`${base}/tasks/${archived ? 'archive' : 'unarchive'}`, { method: 'POST', body: { task_ids: ids } }),

  addSubtask: (id: number, title: string, assignee: string | null) =>
    api<Task>(`${base}/tasks/${id}/subtasks`, { method: 'POST', body: { title, assignee } }),
  patchSubtask: (id: number, sid: number, body: { title?: string; done?: boolean; assignee?: string | null }) =>
    api<Task>(`${base}/tasks/${id}/subtasks/${sid}`, { method: 'PATCH', body }),
  deleteSubtask: (id: number, sid: number) => api<Task>(`${base}/tasks/${id}/subtasks/${sid}`, { method: 'DELETE' }),

  postUpdate: (id: number, body: string, subtaskId: number | null) =>
    api<Task>(`${base}/tasks/${id}/updates`, { method: 'POST', body: { body, subtask_id: subtaskId } }),
  deleteUpdate: (id: number, uid: number) => api<Task>(`${base}/tasks/${id}/updates/${uid}`, { method: 'DELETE' }),

  linkIssue: (id: number, url: string) => api<Task>(`${base}/tasks/${id}/links`, { method: 'POST', body: { url } }),
  unlinkIssue: (id: number, linkId: number) => api<Task>(`${base}/tasks/${id}/links/${linkId}`, { method: 'DELETE' }),
  createIssue: (id: number, repo: string) => api<Task>(`${base}/tasks/${id}/create-issue`, { method: 'POST', body: { repo } }),

  sync: (force = false) => api<SyncResult>(`${base}/sync`, { method: 'POST', body: { force } }),
  memberStats: () => api<MemberStats[]>(`${base}/stats/members`),
  overall: (repo?: string) => api<OverallStats>(`${base}/stats/overall${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`),

  sprints: () => api<(SprintInfo & { task_count: number })[]>(`${base}/sprints`),
  currentSprint: () => api<CurrentSprint>(`${base}/sprints/current`),
  planning: () => api<SprintPlanning>(`${base}/sprints/planning`),
  summary: (key: string) => api<SprintSummary>(`${base}/sprints/${encodeURIComponent(key)}/summary`),
  personalSummary: (key: string, login: string) =>
    api<PersonalSummary>(`${base}/sprints/${encodeURIComponent(key)}/summary?login=${encodeURIComponent(login)}`),
  plan: (key: string, body: { carry_over_ids: number[]; pickup_ids: number[]; new_tasks: { title: string; task_type: TaskType; priority: TaskPriority }[] }) =>
    api<PlanResult>(`${base}/sprints/${encodeURIComponent(key)}/plan`, { method: 'POST', body }),
};

// ---------------------------------------------------------------------------
// Labels

export const STATUSES: TaskStatus[] = ['todo', 'in-progress', 'blocked', 'done'];
export const STATUS_LABELS: Record<TaskStatus, string> = { todo: 'Todo', 'in-progress': 'In progress', blocked: 'Blocked', done: 'Done' };
export const TASK_TYPES: TaskType[] = ['research', 'experiment', 'code', 'bug', 'writing', 'admin'];
export const NON_CODE_TYPES = new Set<TaskType>(['writing', 'admin']);
export const PRIORITIES: TaskPriority[] = ['none', 'P0', 'P1', 'P2', 'P3', 'P4'];
export const SCOPES = [1, 2, 3, 4, 5];
export const ROLES = ['faculty', 'postdoc', 'phd', 'ms', 'undergrad', 'staff', 'other'] as const;
export const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  faculty: 'Faculty',
  postdoc: 'Postdoc',
  phd: 'PhD student',
  ms: 'MS student',
  undergrad: 'Undergrad',
  staff: 'Staff',
  other: 'Other',
};

const PRIORITY_ORDER: Record<TaskPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, none: 5 };
const TYPE_ORDER = Object.fromEntries(TASK_TYPES.map((t, i) => [t, i])) as Record<TaskType, number>;

/** Priority, then type, then most recently updated (the All Tasks order). */
export function byPriority(a: Task, b: Task): number {
  return (
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    TYPE_ORDER[a.task_type] - TYPE_ORDER[b.task_type] ||
    b.updated_at.localeCompare(a.updated_at)
  );
}

export const priorityClass = (p: TaskPriority) => (p === 'P0' ? 'p0' : p === 'P1' ? 'p1' : p === 'P2' ? 'p2' : '');
export const statusClass = (s: TaskStatus) => (s === 'done' ? 'ok' : s === 'blocked' ? 'bad' : s === 'in-progress' ? 'info' : '');

// ---------------------------------------------------------------------------
// People

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** The person on the hook for a subtask: its own assignee, else the task's. */
export const subtaskOwner = (task: Task, s: Task['subtasks'][number]) => s.assignee ?? task.assignee;

/** True when the task belongs on this person's board row: they own it or hold one of its subtasks. */
export const isInvolved = (task: Task, login: string) => same(task.assignee, login) || task.subtasks.some((s) => same(s.assignee, login));

export const isSame = same;

// ---------------------------------------------------------------------------
// Context shared by the board's components

export interface TrackerContextValue {
  config: TrackerConfig;
  team: Member[];
  stats: Map<string, MemberStats>;
  /** login -> display name (falls back to the login). */
  nameOf: (login: string | null | undefined) => string;
  firstName: (login: string | null | undefined) => string;
  /** Replace one task everywhere after a change the server returned. */
  onTaskChanged: (task: Task) => void;
  /** Reload tasks (and archived, sprints). */
  reload: () => void;
  openTask: (task: Task | number) => void;
  notify: (message: string, kind?: 'ok' | 'bad') => void;
}

export const TrackerContext = createContext<TrackerContextValue | null>(null);

export function useTracker(): TrackerContextValue {
  const ctx = useContext(TrackerContext);
  if (!ctx) throw new Error('useTracker must be used inside the tracker page');
  return ctx;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
