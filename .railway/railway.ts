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
    },
  });

  return project('lab-website', { resources: [api, data] });
});
