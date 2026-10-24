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
`;
