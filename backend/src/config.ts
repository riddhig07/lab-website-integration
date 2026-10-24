import { resolve } from 'node:path';

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 4000),
  isProd: env.NODE_ENV === 'production',
  databasePath: resolve(env.DATABASE_PATH ?? './data/lab.db'),
  sessionTtlMs: Number(env.SESSION_TTL_HOURS ?? 168) * 60 * 60 * 1000,
  trustProxy: env.TRUST_PROXY === '1',
  // Origin the browser uses for the site; GitHub redirects back to it after sign-in.
  siteUrl: (env.SITE_URL ?? 'http://localhost:5180').replace(/\/+$/, ''),
  github: {
    clientId: env.GITHUB_CLIENT_ID?.trim() ?? '',
    clientSecret: env.GITHUB_CLIENT_SECRET?.trim() ?? '',
    // Members of this GitHub organization can sign in (owners as admins).
    org: env.GITHUB_ORG?.trim() ?? '',
    // Extra accounts outside the org, by numeric GitHub account id, not
    // username: see auth/github.ts.
    memberIds: idList(env.GITHUB_MEMBER_IDS),
    adminIds: idList(env.GITHUB_ADMIN_IDS),
  },
};

function idList(value: string | undefined): Set<string> {
  return new Set((value ?? '').split(',').map((id) => id.trim()).filter(Boolean));
}
