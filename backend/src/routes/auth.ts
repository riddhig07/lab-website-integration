import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { config } from '../config';
import { authorizeUrl, fetchLogin, fetchOrgRole, githubEnabled, githubRole } from '../auth/github';
import { verifyPassword } from '../auth/password';
import { createSession, destroySession, getSessionUser } from '../auth/session';
import { db } from '../db';

export const authRouter = Router();

// Holds the OAuth state and the portal path to return to while the user is on GitHub.
const OAUTH_COOKIE = 'lab_github_oauth';
const LOGIN_PAGE = '/portal/login';

/** Which sign-in methods the portal's login page should offer. */
authRouter.get('/options', (_req, res) => {
  res.json({ github: githubEnabled });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const row = db
    .prepare('SELECT id, email, name, role, github_login, password_hash FROM users WHERE email = ?')
    .get(email.trim()) as
    | { id: number; email: string; name: string; role: string; github_login: null; password_hash: string | null }
    | undefined;

  if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  createSession(res, row.id);
  const { password_hash: _, ...user } = row;
  res.json(user);
});

/** Starts GitHub sign-in. `from` is the portal path to land on afterwards. */
authRouter.get('/github', (req, res) => {
  if (!githubEnabled) {
    res.redirect(`${LOGIN_PAGE}?error=github_unavailable`);
    return;
  }
  const from = typeof req.query.from === 'string' ? req.query.from : '/';
  const state = randomBytes(32).toString('base64url');
  res.cookie(OAUTH_COOKIE, JSON.stringify({ state, from }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 10 * 60 * 1000,
    path: '/api/auth/github',
  });
  res.redirect(authorizeUrl(state));
});

authRouter.get('/github/callback', async (req, res) => {
  const saved = parseOAuthCookie(req.cookies?.[OAUTH_COOKIE]);
  res.clearCookie(OAUTH_COOKIE, { path: '/api/auth/github' });

  const { code, state } = req.query;
  if (!saved || typeof state !== 'string' || !sameString(state, saved.state)) {
    res.redirect(`${LOGIN_PAGE}?error=github_state`);
    return;
  }
  if (typeof code !== 'string') {
    // The user cancelled on GitHub's consent screen.
    res.redirect(LOGIN_PAGE);
    return;
  }

  let login, orgRole;
  try {
    login = await fetchLogin(code);
    orgRole = await fetchOrgRole(login.token);
  } catch (err) {
    console.error('[auth]', err);
    res.redirect(`${LOGIN_PAGE}?error=github_failed`);
    return;
  }

  const { profile } = login;
  const role = githubRole(profile.id, orgRole);
  if (!role) {
    console.warn(`[auth] Refused GitHub sign-in from @${profile.login} (id ${profile.id}): not in the org or on the allowlist.`);
    const params = new URLSearchParams({ error: 'github_not_allowed', login: profile.login, id: profile.id });
    res.redirect(`${LOGIN_PAGE}?${params}`);
    return;
  }

  // Accounts are matched by GitHub id only, never linked to a password account by email.
  const { id } = db
    .prepare(
      `INSERT INTO users (name, github_id, github_login, role, github_token, github_org_role, github_checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (github_id) DO UPDATE SET
         name = excluded.name, github_login = excluded.github_login, role = excluded.role,
         github_token = excluded.github_token, github_org_role = excluded.github_org_role,
         github_checked_at = excluded.github_checked_at
       RETURNING id`,
    )
    .get(profile.name, profile.id, profile.login, role, login.token, orgRole, Date.now()) as { id: number };

  // The stored token is needed to re-check org membership, so the session
  // can't outlive it.
  createSession(res, id, login.tokenExpiresAt);
  res.redirect(`/portal${safePortalPath(saved.from)}`);
});

authRouter.post('/logout', (req, res) => {
  destroySession(req, res);
  res.status(204).end();
});

authRouter.get('/me', async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  res.json(user);
});

function parseOAuthCookie(value: unknown): { state: string; from: string } | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as { state?: unknown; from?: unknown };
    if (typeof parsed.state !== 'string' || typeof parsed.from !== 'string') return null;
    return { state: parsed.state, from: parsed.from };
  } catch {
    return null;
  }
}

function sameString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Only same-app paths like "/people", so the redirect can't be pointed at another site. */
function safePortalPath(path: string): string {
  return /^\/(?![/\\])[\w\-/]*$/.test(path) ? path : '/';
}
