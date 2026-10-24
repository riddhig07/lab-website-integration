import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { db } from '../db';
import type { Role, User } from '../types';
import { fetchOrgRole, githubRole, ORG_RECHECK_MS } from './github';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: User;
    }
  }
}

const COOKIE_NAME = 'lab_session';

// Only a hash of the token is stored, so a leaked database can't be used to
// hijack sessions.
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Starts a session. `expiresAt` (ms epoch) can end it sooner than the usual lifetime. */
export function createSession(res: Response, userId: number, expiresAt?: number | null): void {
  const token = randomBytes(32).toString('base64url');
  const expires = Math.min(Date.now() + config.sessionTtlMs, expiresAt ?? Infinity);
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), userId, expires);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: expires - Date.now(),
    path: '/',
  });
}

export function destroySession(req: Request, res: Response): void {
  const token: unknown = req.cookies?.[COOKIE_NAME];
  if (typeof token === 'string') {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

interface SessionRow extends User {
  github_id: string | null;
  github_token: string | null;
  github_org_role: Role | null;
  github_checked_at: number | null;
}

export async function getSessionUser(req: Request): Promise<User | null> {
  const token: unknown = req.cookies?.[COOKIE_NAME];
  if (typeof token !== 'string') return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.github_id, u.github_login,
              u.github_token, u.github_org_role, u.github_checked_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), Date.now()) as SessionRow | undefined;
  if (!row) return null;

  const { github_id, github_token, github_org_role, github_checked_at, ...user } = row;
  if (github_id === null) return user;

  let orgRole = github_org_role;

  // Org membership is re-checked every ORG_RECHECK_MS. If GitHub can't be
  // reached, the last known membership stands until the next check.
  if (config.github.org && github_token && Date.now() - (github_checked_at ?? 0) > ORG_RECHECK_MS) {
    try {
      orgRole = await fetchOrgRole(github_token);
      db.prepare('UPDATE users SET github_org_role = ?, github_checked_at = ? WHERE id = ?').run(orgRole, Date.now(), user.id);
    } catch (err) {
      console.error('[auth]', err);
    }
  }

  // The env allowlist is applied on every request, so removing an id (or
  // moving it between lists) applies immediately.
  const role = githubRole(github_id, orgRole);
  if (!role) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    return null;
  }
  return { ...user, role };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  res.locals.user = user;
  next();
}

export function requireRole(role: Role) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (res.locals.user?.role !== role) {
      res.status(403).json({ error: 'You do not have permission to do that' });
      return;
    }
    next();
  };
}
