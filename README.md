# SHERP AI Lab Site

Public lab website + intranet dashboard for Nath Lab (Fall 2026 planning).

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) (port 3001 to avoid clashing with Parallax on 3000).

## Intranet auth

- **Dev:** leave `INTRANET_PASSWORD` unset — intranet routes are open.
- **Production:** set `INTRANET_PASSWORD` in the environment; users sign in at `/intranet/login`.

Copy `.env.example` to `.env.local` when testing password gate.

## Content

Edit typed content in `src/content/` (people, research, news, literature graph, docs, demos).

## Planning doc coverage

- **Public:** home, people, research, news/timeline, contact
- **Intranet:** knowledge base, Drive embed, literature graph + parser API, PM board, GitHub feed, lab ops, meetings + transcription storage
- **Interactive:** spline UGV hero, Three.js inspectable bot, demo video slots, uPlot charts, design-resource footer links

Add MP4 files to `public/videos/` (`sim-stack.mp4`, `sensor-readings.mp4`, `data-analysis.mp4`). Copy `.env.example` to `.env.local`.

### Google Drive browser (`/intranet/drive`)

1. Create a GCP service account with Drive API enabled.
2. Copy the JSON key into `GOOGLE_SERVICE_ACCOUNT_JSON` (single line in `.env.local`).
3. Share your Nath Lab Drive **root folder** with the service account email as **Viewer**.
4. Set `GOOGLE_DRIVE_ROOT_FOLDER_ID` to that folder’s ID (from the Drive URL).

### Git team hub (`/intranet/git`)

1. Add repos in the UI (or pre-seed via localStorage).
2. Fill GitHub usernames in `src/content/team-github.ts`.
3. Set `GITHUB_TOKEN` for private repos, assignees, and higher rate limits.

## Deploy

Standard Next.js deploy (e.g. Vercel). Set `INTRANET_PASSWORD` in project env for production.

See `MEETING_HUB.md` for Drive, OpenAI, and Meeting Hub env vars.

## Git workflow (team)

This repo is the single source of truth for the lab site. **Every change should be committed and pushed to GitHub** so others can pull and Vercel can deploy from `main`.

1. **Clone once:** `git clone https://github.com/S-H-E-R-P-AI-Lab/website.git` then `cd website && npm install`
2. **Before you start:** `git pull origin main`
3. **After you edit:** `git add -A` → `git commit -m "Describe your change"` → `git push origin main`
4. **Optional (recommended for bigger changes):** create a branch, push it, open a pull request on GitHub, merge to `main`.

Add collaborators on the GitHub repo **Settings → Collaborators** so teammates can push. Never commit `.env.local` or service account JSON (see `.gitignore`).
