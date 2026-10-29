// Members' own Google accounts, connected through the "Lab Portal Drive
// uploads" OAuth client so they can add files to the lab's Drive folder as
// themselves. (The site's service account can only read: Google doesn't let
// service accounts own files in someone's My Drive.)
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config';
import { db } from '../db';
import { DriveError } from './drive';

const { oauthClientId: clientId, oauthClientSecret: clientSecret } = config.google;

export const googleUploadsEnabled = Boolean(clientId && clientSecret && config.google.driveFolderId);

// Full Drive access is needed to add files to a folder the app didn't create;
// the client is internal to ucsc.edu, so Google doesn't review it.
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive'];

export const googleCallbackUrl = () => `${config.siteUrl}/api/auth/google/callback`;

export function googleAuthorizeUrl(state: string, loginHint?: string): string {
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleCallbackUrl(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    // Always ask, so Google returns a refresh token even on a reconnect.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  })}`;
}

// ---------------------------------------------------------------------------
// Refresh tokens are stored encrypted with a key derived from the client
// secret, so a copy of the database alone can't be used to reach anyone's Drive.

const KEY = createHash('sha256').update(`lab-portal-google-tokens:${clientSecret}`).digest();

function seal(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

function unseal(sealed: string): string {
  const [iv, tag, data] = sealed.split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
  });
  return (await res.json()) as TokenResponse;
}

/** Finishes the consent flow and stores the account for `userId`. Returns its email. */
export async function connectAccount(userId: number, code: string): Promise<string> {
  const body = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: googleCallbackUrl() });
  if (!body.access_token || !body.refresh_token || !body.id_token) throw new DriveError(502, `Google sign-in failed: ${body.error_description ?? body.error ?? 'no token'}`);
  if (!body.scope?.split(' ').includes('https://www.googleapis.com/auth/drive')) throw new DriveError(400, 'Google Drive access was not granted');
  // The ID token comes straight from Google's token endpoint over TLS, so its claims can be read as is.
  const claims = JSON.parse(Buffer.from(body.id_token.split('.')[1], 'base64url').toString()) as { email?: string; email_verified?: boolean };
  if (!claims.email || claims.email_verified === false) throw new DriveError(400, 'Google did not return a verified email');

  db.prepare(
    `INSERT INTO google_accounts (user_id, email, refresh_token, scope) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET email = excluded.email, refresh_token = excluded.refresh_token,
       scope = excluded.scope, connected_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run(userId, claims.email, seal(body.refresh_token), body.scope);
  accessTokens.set(userId, { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return claims.email;
}

export function connectedEmail(userId: number): string | null {
  const row = db.prepare('SELECT email FROM google_accounts WHERE user_id = ?').get(userId) as { email: string } | undefined;
  return row?.email ?? null;
}

const accessTokens = new Map<number, { value: string; expiresAt: number }>();

/** A current access token for the member's Google account; 409 when they need to (re)connect. */
export async function userAccessToken(userId: number): Promise<{ token: string; email: string }> {
  const row = db.prepare('SELECT email, refresh_token FROM google_accounts WHERE user_id = ?').get(userId) as { email: string; refresh_token: string } | undefined;
  if (!row) throw new DriveError(409, 'Connect your Google account to upload');
  const cached = accessTokens.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return { token: cached.value, email: row.email };

  let refresh: string;
  try {
    refresh = unseal(row.refresh_token);
  } catch {
    disconnectLocal(userId);
    throw new DriveError(409, 'Reconnect your Google account to upload');
  }
  const body = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  if (!body.access_token) {
    // Revoked, expired or the password changed: the member has to connect again.
    if (body.error === 'invalid_grant') {
      disconnectLocal(userId);
      throw new DriveError(409, 'Your Google connection expired. Reconnect to upload');
    }
    throw new DriveError(502, `Google sign-in failed: ${body.error ?? 'no token'}`);
  }
  accessTokens.set(userId, { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return { token: body.access_token, email: row.email };
}

function disconnectLocal(userId: number): void {
  accessTokens.delete(userId);
  db.prepare('DELETE FROM google_accounts WHERE user_id = ?').run(userId);
}

/** Revokes the portal's access at Google and forgets the account. */
export async function disconnectAccount(userId: number): Promise<void> {
  const row = db.prepare('SELECT refresh_token FROM google_accounts WHERE user_id = ?').get(userId) as { refresh_token: string } | undefined;
  if (row) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?${new URLSearchParams({ token: unseal(row.refresh_token) })}`, { method: 'POST' });
    } catch {
      // Already revoked or unreadable; forgetting it locally is what matters.
    }
  }
  disconnectLocal(userId);
}
