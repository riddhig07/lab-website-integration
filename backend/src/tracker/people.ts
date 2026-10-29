// The tracker's team: lab members by GitHub login.
import { db } from '../db';
import type { User } from '../types';

export const ROLES = ['faculty', 'postdoc', 'phd', 'ms', 'undergrad', 'staff', 'other'] as const;
export type MemberRole = (typeof ROLES)[number];

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

type MemberRow = Omit<Member, 'active'> & { active: number };

const fromRow = (r: MemberRow): Member => ({ ...r, active: Boolean(r.active) });

/**
 * How the tracker records who did something: the GitHub login for GitHub
 * accounts, else the email of a password account.
 */
export function actorOf(user: User): string {
  return user.github_login ?? user.email ?? `user-${user.id}`;
}

export function listMembers(activeOnly = false): Member[] {
  const rows = db
    .prepare(`SELECT * FROM tracker_members ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY name COLLATE NOCASE`)
    .all() as MemberRow[];
  return rows.map(fromRow);
}

export function getMember(id: number): Member | null {
  const row = db.prepare('SELECT * FROM tracker_members WHERE id = ?').get(id) as MemberRow | undefined;
  return row ? fromRow(row) : null;
}

/** The active member with this login, if any. */
export function memberByLogin(login: string | null | undefined): Member | null {
  if (!login) return null;
  const row = db.prepare('SELECT * FROM tracker_members WHERE github_login = ? AND active = 1').get(login) as MemberRow | undefined;
  return row ? fromRow(row) : null;
}

/** login (lowercased) -> display name, for every member, active or not. */
export function memberNames(): Map<string, string> {
  const rows = db.prepare('SELECT github_login, name FROM tracker_members').all() as { github_login: string; name: string }[];
  return new Map(rows.map((r) => [r.github_login.toLowerCase(), r.name]));
}

/** GitHub's spelling of a login if it belongs to an active member, else null. */
export function canonicalLogin(login: string | null | undefined): string | null {
  return memberByLogin(login)?.github_login ?? null;
}

export interface MemberInput {
  github_login: string;
  name: string;
  role: MemberRole;
  slack_user_id: string | null;
  active: boolean;
}

export function parseMemberInput(body: unknown, partial: boolean): Partial<MemberInput> | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Expected a JSON object' };
  const b = body as Record<string, unknown>;
  const out: Partial<MemberInput> = {};
  if ('github_login' in b || !partial) {
    const login = String(b.github_login ?? '').trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login)) return { error: 'A valid GitHub username is required' };
    out.github_login = login;
  }
  if ('name' in b || !partial) {
    const name = String(b.name ?? '').trim();
    if (!name || name.length > 200) return { error: 'Name is required (up to 200 characters)' };
    out.name = name;
  }
  if ('role' in b) {
    if (!ROLES.includes(b.role as MemberRole)) return { error: 'Invalid role' };
    out.role = b.role as MemberRole;
  }
  if ('slack_user_id' in b) {
    const id = String(b.slack_user_id ?? '').trim();
    if (id && !/^[UW][A-Z0-9]{2,}$/.test(id)) return { error: 'Slack member ID looks like U0123ABCD' };
    out.slack_user_id = id || null;
  }
  if ('active' in b) out.active = Boolean(b.active);
  return out;
}

/** Adds a member, or updates the one with the same login. */
export function upsertMember(input: Partial<MemberInput> & { github_login: string; name: string }): Member {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tracker_members (github_login, name, role, slack_user_id, active, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)
     ON CONFLICT (github_login) DO UPDATE SET
       name = excluded.name, role = excluded.role, slack_user_id = excluded.slack_user_id,
       active = excluded.active, updated_at = excluded.updated_at`,
  ).run(input.github_login, input.name, input.role ?? 'other', input.slack_user_id ?? null, input.active === false ? 0 : 1, now, now);
  return memberByLoginAny(input.github_login)!;
}

export function updateMember(id: number, input: Partial<MemberInput>): Member | null {
  const current = getMember(id);
  if (!current) return null;
  const next = { ...current, ...input };
  db.prepare(
    `UPDATE tracker_members SET github_login = ?, name = ?, role = ?, slack_user_id = ?, active = ?, updated_at = ? WHERE id = ?`,
  ).run(next.github_login, next.name, next.role, next.slack_user_id, next.active ? 1 : 0, new Date().toISOString(), id);
  return getMember(id);
}

function memberByLoginAny(login: string): Member | null {
  const row = db.prepare('SELECT * FROM tracker_members WHERE github_login = ?').get(login) as MemberRow | undefined;
  return row ? fromRow(row) : null;
}

/** Adds org members who aren't on the team yet; never changes existing ones. */
export function addGithubMembers(people: { login: string; name: string }[]): number {
  const insert = db.prepare(
    `INSERT INTO tracker_members (github_login, name, source) VALUES (?, ?, 'github') ON CONFLICT (github_login) DO NOTHING`,
  );
  let added = 0;
  for (const p of people) added += Number(insert.run(p.login, p.name).changes);
  return added;
}
