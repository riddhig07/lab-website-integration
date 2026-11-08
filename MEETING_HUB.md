# Meeting Hub — credentials

## Google Drive (read + index)

**Option A — Service account (recommended for lab folder)**

1. GCP project → Enable Drive API + Google Docs API.
2. Create service account JSON.
3. Share the **Fall 2026** (or root) Drive folder with the service account email as **Viewer** (Content manager if exporting later).
4. Vercel env:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — minified JSON string
   - `GOOGLE_DRIVE_ROOT_FOLDER_ID` — folder ID from URL

**Option B — OAuth admin**

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_DRIVE_REFRESH_TOKEN` (after one-time OAuth)

Without credentials: **demo mode** uses sample Meeting Notes-Agenda filenames from your Fall 2026 export.

## AI (optional)

- `OPENAI_API_KEY` — Whisper transcription + summaries + assistant
- `OPENAI_MODEL` — default `gpt-4o-mini`

## Persistence

- Metadata stored under `data/meeting-hub/` locally (`MEETING_HUB_DATA_DIR` to override).
- On Vercel, use persistent storage (Supabase/Postgres) — file store is ephemeral on serverless. Plan migration for production.

## Security

- `/meetings`, `/lab-drive`, `/ai-note-taker` respect `INTRANET_PASSWORD` when set.
- Never commit `.env.local`.

## Workflows

1. **Lab Drive** → Sync now → indexes docs, links to calendar meetings by filename/date.
2. **Calendar** → click meeting → meeting detail page.
3. **AI Note Taker** → consent → record → transcript → draft summary → approve on meeting page.
4. **Meetings** → AI assistant asks questions over indexed content.
