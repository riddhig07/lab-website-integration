// Calls to the GitHub API as the lab's GitHub App installation ("SHERP Lab
// Intranet"), which can read every repo in the org and read/write issues.
// Requests made here are the App's, not the signed-in member's: routes decide
// who may trigger them.
import { createSign } from 'node:crypto';
import { githubHeaders } from '../auth/github';
import { config } from '../config';

const API = 'https://api.github.com';
const { appId, installationId, privateKey } = config.githubApp;

export const githubAppEnabled = Boolean(appId && installationId && privateKey);

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Auth: an app JWT exchanged for an hour-long installation token.

let token: { value: string; expiresAt: number } | null = null;

async function installationToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;

  const now = Math.floor(Date.now() / 1000);
  const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  // iat is backdated to allow for clock drift; GitHub caps exp at 10 minutes.
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iss: appId, iat: now - 60, exp: now + 540 })}`;
  const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url')}`;

  const res = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: githubHeaders(jwt),
  });
  const body = (await res.json()) as { token?: string; expires_at?: string; message?: string };
  if (!body.token) throw new GitHubError(502, `GitHub App sign-in failed: ${body.message ?? res.status}`);
  token = { value: body.token, expiresAt: body.expires_at ? Date.parse(body.expires_at) : Date.now() + 3_600_000 };
  return token.value;
}

// ---------------------------------------------------------------------------
// Requests

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

function url(path: string, params: RequestOptions['params'] = {}): string {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') query.set(k, String(v));
  const qs = query.toString();
  return `${path.startsWith('http') ? path : API + path}${qs ? `?${qs}` : ''}`;
}

async function request(target: string, { method = 'GET', body }: RequestOptions = {}): Promise<Response> {
  const res = await fetch(target, {
    method,
    headers: {
      ...githubHeaders(await installationToken()),
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // Statistics endpoints answer 202 while GitHub computes them in the background.
  if (res.status === 202) throw new GitHubError(202, 'computing');
  if (res.ok) return res;

  if (res.status === 404) throw new GitHubError(404, 'Not found on GitHub');
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
    throw new GitHubError(429, 'GitHub rate limit reached, try again in a few minutes');
  }
  const detail = (await res.json().catch(() => ({}))) as { message?: string };
  if (res.status === 422 || res.status === 400) throw new GitHubError(400, `GitHub: ${detail.message ?? res.status}`);
  throw new GitHubError(502, `GitHub error: ${detail.message ?? res.status}`);
}

/** One request, for bodies that aren't JSON (archives). */
export async function ghRaw(path: string, options: RequestOptions = {}): Promise<Response> {
  return request(url(path, options.params), options);
}

/** One request; JSON body, or null for 204. */
export async function gh<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await request(url(path, options.params), options);
  return (res.status === 204 ? null : await res.json()) as T;
}

/**
 * Every page of a list endpoint, following Link rel="next", up to maxPages.
 * `key` picks the array out of wrapped responses (e.g. search results).
 */
export async function ghPaginate<T>(
  path: string,
  params: RequestOptions['params'] = {},
  { maxPages = 10, key }: { maxPages?: number; key?: string } = {},
): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = url(path, { per_page: 100, ...params });
  for (let page = 0; next && page < maxPages; page++) {
    const res = await request(next);
    const body = (await res.json()) as T[] | Record<string, T[]>;
    items.push(...(Array.isArray(body) ? body : (body[key ?? 'items'] ?? [])));
    next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '')?.[1] ?? null;
  }
  return items;
}
