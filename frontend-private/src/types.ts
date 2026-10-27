// Shapes of the data returned by the backend. Field definitions for the
// forms come from the backend at runtime (GET /api/internal/definitions).

export type Role = 'admin' | 'member';

export interface User {
  id: number;
  /** Null for GitHub accounts. */
  email: string | null;
  name: string;
  role: Role;
  /** Set for GitHub accounts. */
  github_login: string | null;
}

export type FieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'url' | 'email' | 'select';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  optionLabels?: Record<string, string>;
  default?: string | number | boolean;
  help?: string;
}

export interface ResourceDef {
  key: string;
  label: string;
  singular: string;
  description: string;
  public: boolean;
  fields: FieldDef[];
  listColumns: string[];
}

// Lab Drive (GET /api/internal/drive/folders/:id)
export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size: number | null;
  modifiedTime: string;
  iconLink: string | null;
  webViewLink: string | null;
  /** For shortcuts: the id of the file they point to. */
  targetId: string | null;
}

export interface DriveFolder {
  /** From the lab folder down to this folder. */
  path: { id: string; name: string }[];
  items: DriveItem[];
}

// GitHub, through the lab's GitHub App (GET /api/internal/github/...)
export interface RepoSummary {
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  fork: boolean;
  language: string | null;
  topics: string[];
  default_branch: string;
  pushed_at: string | null;
  stars: number;
  open_issues: number;
  open_prs: number;
  url: string;
}

export interface IssueSummary {
  repo: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  state_reason: string | null;
  is_pr: boolean;
  draft: boolean;
  merged: boolean;
  user: string | null;
  assignees: string[];
  labels: { name: string; color: string }[];
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  url: string;
}

export interface IssueDetail extends IssueSummary {
  body: string;
  head: string | null;
  base: string | null;
  comment_list: { id: number; user: string | null; body: string; created_at: string; url: string }[];
}

export interface CommitSummary {
  sha: string;
  message: string;
  author_login: string | null;
  author_name: string | null;
  authored_at: string;
  url: string;
}

export interface BranchSummary {
  name: string;
  sha: string;
  protected: boolean;
  is_default: boolean;
}

export interface Contributor {
  login: string;
  avatar_url: string;
  contributions: number;
}

export interface WeekStat {
  /** Week start, unix seconds. */
  week: number;
  commits: number;
  additions: number;
  deletions: number;
}

export interface ContributorStat {
  login: string;
  avatar_url: string | null;
  commits: number;
  additions: number;
  deletions: number;
  weeks: WeekStat[];
}

export interface RepoActivity {
  repo: string;
  weeks: WeekStat[];
  contributors: ContributorStat[];
}

// Task tracker (GET /api/internal/tracker/...)
export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done';
export type TaskPriority = 'none' | 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
export type TaskType = 'research' | 'experiment' | 'code' | 'bug' | 'writing' | 'admin';
export type MemberRole = 'faculty' | 'postdoc' | 'phd' | 'ms' | 'undergrad' | 'staff' | 'other';

export interface Member {
  id: number;
  github_login: string;
  name: string;
  role: MemberRole;
  slack_user_id: string | null;
  active: boolean;
  source: 'github' | 'manual';
  created_at: string;
  updated_at: string;
}

export interface Subtask {
  id: number;
  title: string;
  /** null: the task's assignee owns it */
  assignee: string | null;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  created_at: string;
}

export interface TaskUpdate {
  id: number;
  body: string;
  author: string;
  subtask_id: number | null;
  created_at: string;
}

export interface TaskLink {
  id: number;
  repo: string;
  kind: 'issue' | 'pr';
  number: number;
  title: string;
  state: string;
  merged: boolean;
  url: string;
}

export interface LinkedCommit {
  repo: string;
  sha: string;
  message: string;
  author_login: string | null;
  author_name: string | null;
  authored_at: string;
  url: string;
  merged: boolean;
}

export interface Task {
  id: number;
  /** T-12 */
  ref: string;
  title: string;
  description: string | null;
  assignee: string | null;
  task_type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  scope: number | null;
  pm_note: string | null;
  sprint_key: string | null;
  sprint_keys: string[];
  position: number;
  archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  subtasks: Subtask[];
  subtask_done_count: number;
  /** Newest first. */
  updates: TaskUpdate[];
  links: TaskLink[];
  /** Newest first. */
  commits: LinkedCommit[];
  commit_authors: { login: string | null; name: string; count: number; merged: number; unmerged: number }[];
}

export interface TrackerConfig {
  ai_enabled: boolean;
  github_enabled: boolean;
  slack_enabled: boolean;
  timezone: string;
  me: { actor: string; member: Member | null; is_admin: boolean };
}

export interface SprintInfo {
  key: string;
  number: number;
  label: string;
  start_at: string;
  end_at: string;
  status: 'active' | 'closed';
  closed_at: string | null;
  planned_by: string[];
}

export interface CurrentSprint extends SprintInfo {
  planning_needed: boolean;
  member: string | null;
}

export interface SummaryPerson {
  login: string;
  name: string;
  committed: number;
  completed: number;
  todo: number;
  in_progress: number;
  blocked: number;
  helping: number;
  subtasks_total: number;
  subtasks_done: number;
  updates: number;
  commits: number;
}

export interface SummaryTask {
  id: number;
  title: string;
  owner: string | null;
  owner_name: string | null;
  helpers: string[];
  status: TaskStatus;
  priority: TaskPriority;
  task_type: TaskType;
  completed: boolean;
  completed_at: string | null;
  moved_on: boolean;
  archived: boolean;
  subtasks_total: number;
  subtasks_done: number;
}

export interface SprintSummary extends SprintInfo {
  generated_at: string;
  totals: {
    committed: number;
    completed: number;
    completion_pct: number;
    unfinished: number;
    in_progress: number;
    blocked: number;
    todo: number;
    created_in_sprint: number;
    subtasks_checked: number;
    updates: number;
    commits: number;
    commits_merged: number;
  };
  people: SummaryPerson[];
  tasks: SummaryTask[];
  subtasks_checked: { task: string; subtask: string; by: string | null; at: string }[];
  updates: { task: string; author: string; author_name: string; body: string; at: string }[];
  burnup: { date: string; completed: number }[];
}

export interface PersonalSummary {
  key: string;
  number: number;
  label: string;
  start_at: string;
  end_at: string;
  status: string;
  person: Pick<SummaryPerson, 'login' | 'committed' | 'completed' | 'updates' | 'commits' | 'subtasks_done' | 'subtasks_total' | 'helping'>;
  tasks: SummaryTask[];
  subtasks_checked: SprintSummary['subtasks_checked'];
  updates: SprintSummary['updates'];
}

export interface PlanCandidate {
  id: number;
  title: string;
  assignee: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  task_type: TaskType;
  sprint_key: string | null;
  subtasks_total: number;
  subtasks_done: number;
}

export interface SprintPlanning {
  sprint: SprintInfo;
  member: string | null;
  needed: boolean;
  previous: PersonalSummary | null;
  carry_over: PlanCandidate[];
  backlog: PlanCandidate[];
  in_sprint: PlanCandidate[];
}

export interface MemberStats {
  login: string;
  commit_count: number;
  merged_count: number;
  unmerged_count: number;
  additions: number;
  deletions: number;
  merged_additions: number;
  merged_deletions: number;
  unmerged_additions: number;
  unmerged_deletions: number;
  pending_line_counts: number;
  repos: string[];
  window_start: string;
}

export interface OverallStats {
  /** Repos GitHub is still computing statistics for. */
  computing: string[];
  repos: string[];
  weeks: WeekStat[];
  contributors: ContributorStat[];
}

export interface SyncResult {
  members_added: number;
  repos_scanned: number;
  repos_unchanged: number;
  commits_seen: number;
  links_added: number;
  links_refreshed: number;
  tasks_completed: number;
  errors: string[];
}
