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
  // The lab's GitHub App, installed on the org: repo browsing, issues and the
  // task tracker's commit links. Separate from the OAuth app used for sign-in.
  githubApp: {
    appId: env.GITHUB_APP_ID?.trim() ?? '',
    installationId: env.GITHUB_APP_INSTALLATION_ID?.trim() ?? '',
    // Base64 of the app's .pem private key.
    privateKey: env.GITHUB_APP_PRIVATE_KEY?.trim() ? Buffer.from(env.GITHUB_APP_PRIVATE_KEY.trim(), 'base64').toString() : '',
  },
  tracker: {
    // Sprints run Saturday 11:00 to Saturday 11:00 in this timezone, and the
    // Slack reminders go out on its clock.
    timezone: env.TRACKER_TIMEZONE?.trim() || 'America/Los_Angeles',
  },
  slack: {
    botToken: env.SLACK_BOT_TOKEN?.trim() ?? '',
    // Channel the task tracker's weekly reminder and sprint recap post to.
    trackerChannelId: env.SLACK_TRACKER_CHANNEL_ID?.trim() ?? '',
    // Log Slack messages instead of sending them.
    dryRun: env.SLACK_DRY_RUN === '1',
  },
  gemini: {
    // Google AI Studio key for the tracker's assistant; without it the
    // assistant is off.
    apiKey: env.GEMINI_API_KEY?.trim() ?? '',
    model: env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
  },
  google: {
    // Base64 of the service account's JSON key.
    serviceAccountKey: env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim() ?? '',
    // The lab's Drive folder, shown in the portal's file explorer. The
    // service account must have access to it.
    driveFolderId: env.GOOGLE_DRIVE_FOLDER_ID?.trim() ?? '',
  },
};

function idList(value: string | undefined): Set<string> {
  return new Set((value ?? '').split(',').map((id) => id.trim()).filter(Boolean));
}
