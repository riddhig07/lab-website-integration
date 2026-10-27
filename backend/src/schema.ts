// Columns for content tables must match the field names in resources.ts.
// Tables are created if missing; for changes to existing tables, add a
// migration step here (or adopt a migration tool).
export const SCHEMA = `
-- A user signs in with a password (email + password_hash) or with GitHub
-- (github_id), never both. GitHub users' roles come from their org
-- membership and the allowlist in the environment, not from the role column.
-- github_token is their latest OAuth token, used only to re-check org
-- membership (see auth/github.ts).
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT UNIQUE COLLATE NOCASE,
  name              TEXT NOT NULL,
  password_hash     TEXT,
  github_id         TEXT UNIQUE,
  github_login      TEXT,
  github_token      TEXT,
  github_org_role   TEXT,
  github_checked_at INTEGER,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((email IS NOT NULL AND password_hash IS NOT NULL) OR github_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS people (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  title      TEXT,
  category   TEXT NOT NULL,
  email      TEXT,
  website    TEXT,
  photo_url  TEXT,
  bio        TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_public  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS publications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  authors    TEXT NOT NULL,
  venue      TEXT,
  year       INTEGER NOT NULL,
  url        TEXT,
  pdf_url    TEXT,
  featured   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  published_at TEXT NOT NULL,
  is_public    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  category    TEXT,
  url         TEXT,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Task tracker (see tracker/). People are keyed by GitHub login, which is how
-- members sign in and how commits and issues name them. Timestamps are ISO
-- 8601 in UTC (what JS's toISOString() writes), so they compare as strings.

CREATE TABLE IF NOT EXISTS tracker_members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  github_login  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'other',
  slack_user_id TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  -- 'github' when added by the org-member sync, 'manual' otherwise
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tracker_tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  description  TEXT,
  assignee     TEXT COLLATE NOCASE,
  task_type    TEXT NOT NULL DEFAULT 'research',
  priority     TEXT NOT NULL DEFAULT 'none',
  status       TEXT NOT NULL DEFAULT 'todo',
  scope        INTEGER,
  pm_note      TEXT,
  -- The sprint the task is in now; NULL is the backlog.
  sprint_key   TEXT,
  -- Card order within a board column, lowest first.
  position     REAL NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,
  archived_at  TEXT,
  archived_by  TEXT,
  -- When the task last became done; sprint summaries count it there.
  completed_at TEXT,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS tracker_tasks_sprint ON tracker_tasks(sprint_key);

-- Every sprint a task was ever in, so moving it on never rewrites an earlier
-- sprint's history.
CREATE TABLE IF NOT EXISTS tracker_task_sprints (
  task_id    INTEGER NOT NULL REFERENCES tracker_tasks(id) ON DELETE CASCADE,
  sprint_key TEXT NOT NULL,
  PRIMARY KEY (task_id, sprint_key)
);
CREATE INDEX IF NOT EXISTS tracker_task_sprints_key ON tracker_task_sprints(sprint_key);

CREATE TABLE IF NOT EXISTS tracker_subtasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tracker_tasks(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  -- NULL: whoever owns the task
  assignee   TEXT COLLATE NOCASE,
  done       INTEGER NOT NULL DEFAULT 0,
  done_at    TEXT,
  done_by    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS tracker_subtasks_task ON tracker_subtasks(task_id);

CREATE TABLE IF NOT EXISTS tracker_updates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tracker_tasks(id) ON DELETE CASCADE,
  subtask_id INTEGER REFERENCES tracker_subtasks(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  author     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS tracker_updates_task ON tracker_updates(task_id);

-- GitHub issues and pull requests a task is linked to. state and merged are
-- refreshed by the sync job.
CREATE TABLE IF NOT EXISTS tracker_links (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id   INTEGER NOT NULL REFERENCES tracker_tasks(id) ON DELETE CASCADE,
  repo      TEXT NOT NULL,
  kind      TEXT NOT NULL CHECK (kind IN ('issue', 'pr')),
  number    INTEGER NOT NULL,
  title     TEXT NOT NULL DEFAULT '',
  state     TEXT NOT NULL DEFAULT 'open',
  merged    INTEGER NOT NULL DEFAULT 0,
  url       TEXT NOT NULL,
  synced_at TEXT,
  UNIQUE (task_id, repo, kind, number)
);
CREATE INDEX IF NOT EXISTS tracker_links_issue ON tracker_links(repo, number);

-- Recent commits across the org's repos (all branches), collected by the sync
-- job. on_default: reachable from the repo's default branch, i.e. merged.
CREATE TABLE IF NOT EXISTS gh_commits (
  repo         TEXT NOT NULL,
  sha          TEXT NOT NULL,
  message      TEXT NOT NULL,
  author_login TEXT COLLATE NOCASE,
  author_name  TEXT,
  authored_at  TEXT NOT NULL,
  url          TEXT NOT NULL,
  on_default   INTEGER NOT NULL DEFAULT 0,
  -- Line counts need a request per commit, so only recent commits get them.
  additions    INTEGER,
  deletions    INTEGER,
  PRIMARY KEY (repo, sha)
);
CREATE INDEX IF NOT EXISTS gh_commits_author ON gh_commits(author_login, authored_at);

CREATE TABLE IF NOT EXISTS tracker_commits (
  task_id INTEGER NOT NULL REFERENCES tracker_tasks(id) ON DELETE CASCADE,
  repo    TEXT NOT NULL,
  sha     TEXT NOT NULL,
  PRIMARY KEY (task_id, repo, sha)
);

-- Per repo: the push the sync job last scanned, so unchanged repos are skipped.
CREATE TABLE IF NOT EXISTS gh_repo_sync (
  repo       TEXT PRIMARY KEY,
  pushed_at  TEXT,
  synced_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tracker_sprints (
  key           TEXT PRIMARY KEY,
  number        INTEGER NOT NULL UNIQUE,
  start_at      TEXT NOT NULL,
  end_at        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  closed_at     TEXT,
  -- Frozen when the sprint closes.
  summary_json  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Who has planned which sprint (drives the planning prompt).
CREATE TABLE IF NOT EXISTS tracker_sprint_planned (
  sprint_key TEXT NOT NULL REFERENCES tracker_sprints(key) ON DELETE CASCADE,
  login      TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (sprint_key, login)
);

-- Scheduled Slack posts already sent, so a restart never posts twice.
CREATE TABLE IF NOT EXISTS tracker_notifications (
  kind    TEXT NOT NULL,
  key     TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (kind, key)
);
`;
