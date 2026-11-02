// Railway setup for the backend API (preview with `railway config plan`,
// apply with `railway config apply`). Code is deployed with `railway up --service api`.
// GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are secrets: set them with
// `railway variables --service api --set ...`, never in this file.
import { defineRailway, preserve, project, service, volume } from 'railway/iac';

export default defineRailway(() => {
  // SQLite database. Back it up; deleting or shrinking this volume loses all content.
  // The region is where Railway placed it; changing it would recreate the volume.
  const data = volume('lab-data', { region: 'us-west2', sizeMB: 1024 });

  const api = service('api', {
    build: 'npm run typecheck -w backend',
    start: 'npm start -w backend',
    healthcheck: '/api/health',
    volumeMounts: { '/data': data },
    env: {
      RAILPACK_NODE_VERSION: '22',
      NODE_ENV: 'production',
      TRUST_PROXY: '1',
      DATABASE_PATH: '/data/lab.db',
      // The public URL people use (Vercel); GitHub sign-in redirects back to it.
      SITE_URL: preserve(),
      GITHUB_CLIENT_ID: preserve(),
      GITHUB_CLIENT_SECRET: preserve(),
      // Org members can sign in; org owners are admins.
      GITHUB_ORG: 'S-H-E-R-P-AI-Lab',
      // Extra accounts outside the org, by numeric GitHub id.
      GITHUB_MEMBER_IDS: '',
      GITHUB_ADMIN_IDS: '',
      // "SHERP Lab Intranet" GitHub App, installed on the org: the portal's
      // Repositories pages and the task board's GitHub sync (members, commits,
      // linked issues) and "Create issue". The private key (base64 PEM) is a
      // secret set outside this file.
      GITHUB_APP_ID: '5457822',
      GITHUB_APP_INSTALLATION_ID: '174893510',
      GITHUB_APP_PRIVATE_KEY: preserve(),
      // "SHERP Lab Website" Slack app in the PicarX Research workspace
      // (https://api.slack.com/apps/A0CBUCB5GBY). Bot scopes: channels:read,
      // channels:history, chat:write, users:read, files:read. Invite the bot to
      // a channel before reading its history. Both values are secrets.
      SLACK_BOT_TOKEN: preserve(),
      SLACK_SIGNING_SECRET: preserve(),
      // Channel id (C0…) for the task board's Wednesday check-in and Monday
      // sprint recap. Invite the bot to it first. Unset: no Slack posts.
      SLACK_TRACKER_CHANNEL_ID: preserve(),
      // The task board's clock: sprints run Monday 12:30 to Monday 12:30.
      TRACKER_TIMEZONE: 'America/Los_Angeles',
      // Claude API key for the portal's assistant (a secret, set outside this
      // file). Unset: the assistant button is hidden.
      ANTHROPIC_API_KEY: preserve(),
      ANTHROPIC_MODEL: 'claude-haiku-5-5',
      // Service account lab-website@sherp-lab-website.iam.gserviceaccount.com
      // (Google Cloud project sherp-lab-website, Drive/Docs/Calendar APIs on).
      // It sees only what is shared with it (read-only). The key (base64
      // JSON) is a secret.
      GOOGLE_SERVICE_ACCOUNT_KEY: preserve(),
      // OAuth client "Lab Portal Drive uploads" (same Cloud project, Internal:
      // ucsc.edu accounts only). Members connect their own Google account
      // through it to upload to Lab Drive; the service account can't, since
      // the folder is in a user's My Drive. Both are secrets.
      GOOGLE_OAUTH_CLIENT_ID: preserve(),
      GOOGLE_OAUTH_CLIENT_SECRET: preserve(),
      // The "Nath Lab" Drive folder, browsable in the portal's Lab Drive page.
      GOOGLE_DRIVE_FOLDER_ID: '1trCaDHYPd9_ELgNx0JEd68qw0sJsp8cY',
    },
  });

  return project('lab-website', { resources: [api, data] });
});
