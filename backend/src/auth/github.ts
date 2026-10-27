// Sign in with GitHub, limited to members of the lab's GitHub organization
// (GITHUB_ORG) plus any extra accounts in GITHUB_MEMBER_IDS / GITHUB_ADMIN_IDS.
//
// Org owners become admins and other active org members become members.
// Membership is read with the user's own token (read:org scope) at sign-in and
// re-checked every few minutes while they are signed in, so leaving the org
// ends access within ORG_RECHECK_MS.
//
// The extra-account lists match on the numeric GitHub account id rather than
// the username: usernames can be renamed and, once released, claimed by
// someone else, while the id never changes.
//
// It fails closed: with no org and no ids configured nobody can sign in with
// GitHub.
import { config } from '../config';
import type { Role } from '../types';

const { clientId, clientSecret, org, memberIds, adminIds } = config.github;

export const githubEnabled = Boolean(clientId && clientSecret && (org || memberIds.size > 0 || adminIds.size > 0));

if (clientId && !githubEnabled) {
  console.error('[auth] GITHUB_CLIENT_ID is set but GitHub sign-in is off: set GITHUB_CLIENT_SECRET and GITHUB_ORG (or ids in GITHUB_MEMBER_IDS / GITHUB_ADMIN_IDS).');
}

export const ORG_RECHECK_MS = 10 * 60 * 1000;

/**
 * The role a GitHub account gets, given its role in the org (null if not a
 * member), or null if it isn't allowed in. The higher of the two wins.
 */
export function githubRole(githubId: string, orgRole: Role | null): Role | null {
  if (!githubEnabled) return null;
  const roles = [org ? orgRole : null, adminIds.has(githubId) ? 'admin' : memberIds.has(githubId) ? 'member' : null];
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('member')) return 'member';
  return null;
}

export const callbackUrl = () => `${config.siteUrl}/api/auth/github/callback`;

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(),
    state,
    // read:org lets us see the user's (possibly private) org membership.
    // Without an org, the public profile (id, login, name) is all we need.
    scope: org ? 'read:org' : '',
    allow_signup: 'false',
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export interface GitHubProfile {
  id: string;
  login: string;
  name: string;
}

export interface GitHubLogin {
  profile: GitHubProfile;
  token: string;
  /** When the token stops working (ms epoch), or null if it doesn't expire. */
  tokenExpiresAt: number | null;
}

/** Exchanges the OAuth code for the user's token and GitHub profile. */
export async function fetchLogin(code: string): Promise<GitHubLogin> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: callbackUrl() }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!token.access_token) throw new Error(`GitHub token exchange failed: ${token.error ?? tokenRes.status}`);

  const userRes = await fetch('https://api.github.com/user', { headers: githubHeaders(token.access_token) });
  if (!userRes.ok) throw new Error(`GitHub user lookup failed: ${userRes.status}`);
  const user = (await userRes.json()) as { id: number; login: string; name: string | null };

  return {
    profile: { id: String(user.id), login: user.login, name: user.name || user.login },
    token: token.access_token,
    tokenExpiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
  };
}

/**
 * The account's role in GITHUB_ORG: 'admin' for org owners, 'member' for other
 * active members, null for everyone else (including pending invites and
 * revoked or expired tokens). Throws when GitHub can't answer, so callers can
 * tell "not a member" from "couldn't check".
 */
export async function fetchOrgRole(token: string): Promise<Role | null> {
  if (!org) return null;
  const res = await fetch(`https://api.github.com/user/memberships/orgs/${encodeURIComponent(org)}`, {
    headers: githubHeaders(token),
  });
  const rateLimited = res.headers.get('x-ratelimit-remaining') === '0';
  if (!rateLimited && (res.status === 401 || res.status === 403 || res.status === 404)) return null;
  if (!res.ok) throw new Error(`GitHub org membership lookup failed: ${res.status}`);
  const membership = (await res.json()) as { state: string; role: string };
  if (membership.state !== 'active') return null;
  return membership.role === 'admin' ? 'admin' : 'member';
}

export function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'lab-website',
  };
}
