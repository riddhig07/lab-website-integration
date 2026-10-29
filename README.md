# Lab Website

```
frontend/           React + Vite: public site (/)
frontend-private/   React + Vite: members portal (/portal), a separate app
backend/            Express + SQLite API (/api)
```

- **Public site** (`frontend/src/public`): home, research, people, publications, news, contact. Reads `/api/public/*` only and contains no portal code.
- **Members portal** (`frontend-private/src`): sign-in-only app served at `/portal` for managing site content and internal resources. Built and deployed separately from the public site. Calls `/api/internal/*`, which requires a session. Includes **Lab Drive** (`/portal/drive`), a read-only explorer for the lab's Google Drive folder: folder tree, breadcrumbs, filter, and downloads (Google Docs/Sheets/Slides export to .docx/.xlsx/.pptx) served through the backend, so they work for every portal member, whether or not they have access to the folder in Google Drive. Also **Repositories** (`/portal/repos`) and the **Task Board** (`/portal/tracker`), described below.
- **Backend** (`backend/src`):
  - `routes/public.ts`: unauthenticated, returns only public rows/columns
  - `routes/auth.ts`: login / logout / current user (httpOnly cookie sessions)
  - `routes/internal.ts`: authenticated CRUD for every content type, plus the Drive, GitHub and tracker routers
  - `github/`: the GitHub App client (`app.ts`) and cached repo / issue / commit reads (`repos.ts`)
  - `tracker/`: the task board: tasks, sprints, planning, GitHub sync and stats; `slack/` and `ai/` hold its Slack posts and assistant; `jobs.ts` runs its background work
  - `resources.ts`: content type definitions (fields, labels, validation); the portal builds its forms from these
  - `schema.ts`: SQLite tables
  - `seed.ts`: creates the first admin and sample content

## Getting started

Requires Node 22.13+ (for the built-in `node:sqlite` module).

```sh
npm install
cp backend/.env.example backend/.env   # then set ADMIN_EMAIL / ADMIN_PASSWORD
npm run seed                           # creates the admin account + sample content
npm run dev                            # backend :4000, public :5180, portal :5181
```

Open http://localhost:5180 for the public site and http://localhost:5180/portal to sign in (the public dev server proxies `/portal` to the portal's dev server on :5181).

| Command | What it does |
| --- | --- |
| `npm run dev` | Backend + both frontends with hot reload |
| `npm run seed` | Create the first admin and sample content (safe to re-run) |
| `npm run build` | Build both frontends to `frontend/dist` and `frontend-private/dist` |
| `npm run typecheck` | Type-check all three folders |

## Editing content

- **Lab name, research areas, contact info:** `frontend/src/public/site.ts`
- **People, publications, news, internal resources:** sign in at `/portal`

To add a field or content type: add it in `backend/src/resources.ts` and the matching column/table in `backend/src/schema.ts` (plus an `ORDER_BY` entry in `routes/internal.ts` for new types). The portal picks it up automatically; show it on the public site as needed.

**Roles:** `member` can view, create and edit; `admin` can also delete.

## Deployment

Live at https://lab-website-pied.vercel.app.

- **Vercel** (project `lab-website`) serves both frontends as static files: the public site at `/`, the portal at `/portal`. It forwards `/api/*` to Railway (`deploy/vercel.json`), so the browser sees one origin and the session cookie works.
- **Railway** (project `lab-website`, service `api`) runs the backend, with the SQLite database on the `lab-data` volume at `/data`. Service settings, the volume and non-secret env vars are declared in `.railway/railway.ts`.

| Command | What it does |
| --- | --- |
| `npm run deploy:web` | Build both frontends into `dist/` and deploy it to Vercel production |
| `npm run deploy:api` | Upload and deploy the backend to Railway |
| `railway config plan` / `apply` | Preview / apply changes to `.railway/railway.ts` |

Requires `railway login` and `npx vercel login`. If the backend's Railway domain changes, update `deploy/vercel.json`. If the site's URL changes, update `SITE_URL` on Railway and the GitHub OAuth app's callback URL.

**Who can sign in:** members of the `S-H-E-R-P-AI-Lab` GitHub org (`GITHUB_ORG`). Org owners are portal admins and other members are portal members. To give someone access, invite them to the org. Once they leave it, they lose access within 10 minutes. GitHub sessions last at most 8 hours, the lifetime of the GitHub token. Accounts outside the org can be added by numeric id in `GITHUB_MEMBER_IDS` / `GITHUB_ADMIN_IDS` in `.railway/railway.ts`.

The GitHub OAuth app ("SHERP Lab Website") is owned by the org: https://github.com/organizations/S-H-E-R-P-AI-Lab/settings/applications/3961042. Its callback URL must match `SITE_URL`.

Secrets (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`) are set with `railway variables --service api --set ...`, never in the repo. `preserve()` in `.railway/railway.ts` keeps them on apply.

On Windows with Git Bash, `railway config` can fail with "requires Railway CLI 5.42.1 or newer" even on a newer CLI: the SDK runs the CLI from the `_` variable, which Git Bash sets to a path Node can't execute. Run it from PowerShell, or call the CLI's `railway.exe` directly with `_` set to that same path.

## Integrations

Credentials the backend can use, all stored as Railway variables on the `api` service (secrets via `railway variable set NAME --stdin`, never in the repo; ids in `.railway/railway.ts`). The portal's Lab Drive page uses the Google service account; the Repositories pages and the Task Board use the GitHub App; the Task Board's weekly posts use the Slack bot (once `SLACK_TRACKER_CHANNEL_ID` is set) and the portal's assistant uses `ANTHROPIC_API_KEY` (a Claude API key, model `ANTHROPIC_MODEL`, default `claude-haiku-5-5`; the assistant is hidden until the key is set).

| Service | What | Access | Manage at |
| --- | --- | --- | --- |
| GitHub | App "SHERP Lab Intranet" (id 5457822), installed on all `S-H-E-R-P-AI-Lab` repos | Read contents, metadata, PRs and org members; read/write issues and org projects | https://github.com/organizations/S-H-E-R-P-AI-Lab/settings/apps/sherp-lab-intranet |
| GitHub | OAuth app "SHERP Lab Website" (portal sign-in) | Public profile + `read:org` per user | https://github.com/organizations/S-H-E-R-P-AI-Lab/settings/applications/3961042 |
| Slack | App "SHERP Lab Website" in the PicarX Research workspace | Bot: `channels:read`, `channels:history`, `chat:write`, `users:read`, `files:read`. Invite `@SHERP Lab Website` to a channel before reading its history | https://api.slack.com/apps/A0CBUCB5GBY |
| Google | Service account `lab-website@sherp-lab-website.iam.gserviceaccount.com` (Cloud project `sherp-lab-website` under ucsc.edu; Drive, Docs and Calendar APIs enabled) | Only what is shared with it (read-only): the "Nath Lab" Drive folder, shown in the portal's Lab Drive page (`GOOGLE_DRIVE_FOLDER_ID`), plus an empty test folder "SHERP Lab Website". Share more folders or calendars with that address to give it access | https://console.cloud.google.com/iam-admin/serviceaccounts?project=sherp-lab-website |

To rotate a key, create a new one at the link above, set it on Railway, redeploy, then delete the old one.

**Local development** (`backend/.env`, gitignored) has working values for all of these. Portal sign-in uses a separate OAuth app, "SHERP Lab Website (local dev)" (https://github.com/organizations/S-H-E-R-P-AI-Lab/settings/applications/3961157), whose only callback is `http://localhost:5180/api/auth/github/callback`. The GitHub App and the Google service account each have a second key used only locally, so either environment's key can be revoked without breaking the other. The Slack bot token and signing secret are the same as production: Slack issues one per workspace install.

**For Claude Code** (`.mcp.json`): `github` (GitHub's hosted MCP server; needs a `GITHUB_PAT` environment variable holding a GitHub token) and `railway` (sign in with `/mcp`). Google Drive, Calendar and Gmail come from claude.ai connectors, as does Slack once connected at https://claude.ai/settings/connectors.

## Repositories and the Task Board

**Repositories** (`/portal/repos`) lists every repo the GitHub App is installed on, the open issues and pull requests across the org, and per repo its issues, PRs, commits, branches, contributors and weekly activity. Members can comment on, close and reopen issues; the App posts them and signs each with the member's username.

**Task Board** (`/portal/tracker`) is the lab's work tracker, modelled on SmartBrowse's story tracker:

- **Team:** everyone in the GitHub org, added by the sync. Set each person's role and Slack member id under "Edit member". Admins can deactivate people.
- **Tasks:** an assignee (GitHub login), type, priority (P0–P4), status, scope (1–5), a PM note, subtasks (each can be handed to someone else, which puts the task on their row too) and progress updates. Done tasks can be archived. Any member can create and edit tasks; only admins delete them.
- **Board:** a row per person and a column per status. Drag cards between columns to change status, or onto someone else's row to reassign. The status dropdown on each card does the same without dragging.
- **Sprints:** weekly, Saturday 11:00 to Saturday 11:00 (`TRACKER_TIMEZONE`). At the start of each sprint everyone gets a wrap-up of their last one and picks what to carry over, pull from the backlog or add. The Sprints tab shows each sprint's scorecard, burn-up and per-person progress; closed sprints keep the summary frozen at close.
- **GitHub:** every 10 minutes (and on "Sync from GitHub") the backend reads recent commits on every branch of every repo. A commit links to a task when its message contains the task's ref (`T-12`), the `#number` of an issue or PR linked to the task (same repo), or the task's whole title (code tasks only). Pills show merged vs on-branch commits. Link issues and PRs from the task dialog, or create an issue from a task. **Closing a linked issue marks its task done.** From an issue page, "Track as task" creates a linked task.
- **Overall:** commits and lines added/removed per week across the org, plus contributors.
- **Slack** (when `SLACK_TRACKER_CHANNEL_ID` is set): Wednesday 09:00 check-in in the channel, Saturday 11:00 sprint recap, and a DM (Wednesday and Friday) to members with a Slack id who haven't posted an update yet. Set `SLACK_DRY_RUN=1` to log them instead.
- **Assistant** (when `ANTHROPIC_API_KEY` is set): the button at the bottom right of every portal page opens a chat with Claude (Haiku 5.5 by default, `ANTHROPIC_MODEL`). It answers questions about tasks, sprints and GitHub, knows which page you have open, and can create and update tasks as the signed-in member. Each tool call it makes is shown as a card with its arguments, timing and a small view of the result (task lists, commit bars, sprint progress, diffstats). Code: `backend/src/ai/` and `frontend-private/src/assistant/`.

## Next steps

- User management in the portal (invite members, reset passwords). For now, `npm run seed` with different `ADMIN_*` values adds another admin; add `member` accounts via SQL.
- Login rate limiting.
- Image uploads for people photos (currently URLs).
- A migration tool once the schema starts changing on a live database.
