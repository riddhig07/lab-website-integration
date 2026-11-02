import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { db } from '../db';
import { driveEnabled, DriveError, fileMeta } from '../google/drive';
import { connectedEmail, googleUploadsEnabled } from '../google/userAuth';
import { meetingFolders } from '../meetings/folders';
import { notesEnabled } from '../meetings/notes';
import { enqueue } from '../meetings/pipeline';
import { createMeeting, getMeeting, getRow, listMeetings, patchMeeting } from '../meetings/store';
import { transcriberEnabled } from '../meetings/transcriber';
import { listMembers } from '../tracker/people';
import type { User } from '../types';

// Recording in-person meetings and turning them into notes (mounted under
// /api/internal). The audio goes to Drive straight from the browser (the
// Drive uploads route); this router only starts and reports on the pipeline.
export const meetingsRouter = Router();

/** What's missing for the feature to work, in words. */
function problems(): string[] {
  const out: string[] = [];
  if (!driveEnabled) out.push('Google Drive is not set up (GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_DRIVE_FOLDER_ID)');
  if (!googleUploadsEnabled) out.push('Google uploads are not set up (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET)');
  if (!transcriberEnabled) out.push('The transcriber is not set up (MEETINGS_TRANSCRIBER_URL)');
  if (!notesEnabled) out.push('Claude is not set up (ANTHROPIC_API_KEY)');
  return out;
}

const login = (user: User) => (user.github_login ? `@${user.github_login}` : (user.email ?? user.name));

/** Whether recording works, plus what the page needs to start: the member's Google connection, the folders and the team. */
meetingsRouter.get('/options', async (_req, res) => {
  const user = res.locals.user!;
  const missing = problems();
  const email = missing.length === 0 ? connectedEmail(user.id) : null;
  const folders = email ? await meetingFolders(user.id, login(user)) : null;
  res.json({
    enabled: missing.length === 0,
    problems: missing,
    google_email: email,
    notes_folder_id: folders?.notes ?? null,
    recordings_folder_id: folders?.recordings ?? null,
    members: listMembers(true).map((m) => ({ login: m.github_login, name: m.name })),
  });
});

const enabled: RequestHandler = (_req, res, next) => {
  const missing = problems();
  if (missing.length) {
    res.status(503).json({ error: `Meetings are not set up: ${missing.join('; ')}.` });
    return;
  }
  next();
};

meetingsRouter.get('/', (_req, res) => {
  res.json(listMeetings());
});

meetingsRouter.get('/:id', (req, res) => {
  const meeting = getMeeting(Number(req.params.id));
  if (!meeting) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(meeting);
});

/** Starts the notes for an uploaded recording: { audio_file_id, title?, attendees?, speaker_count? }. */
meetingsRouter.post('/', enabled, async (req, res) => {
  const user = res.locals.user!;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fileId = typeof body.audio_file_id === 'string' ? body.audio_file_id.trim() : '';
  if (!/^[\w-]{10,100}$/.test(fileId)) {
    res.status(400).json({ error: 'audio_file_id is required' });
    return;
  }
  const attendees = Array.isArray(body.attendees)
    ? body.attendees.filter((a): a is string => typeof a === 'string').map((a) => a.trim().slice(0, 100)).filter(Boolean).slice(0, 50)
    : [];
  const speakers = Number(body.speaker_count);
  const speakerCount = Number.isInteger(speakers) && speakers >= 1 && speakers <= 20 ? speakers : null;

  const meta = await fileMeta(fileId);
  if (!meta?.inLab) throw new DriveError(404, "That recording isn't in the lab's Drive folder");
  if (!/^(audio|video)\//.test(meta.item.mimeType)) throw new DriveError(400, 'That file is not an audio recording');

  // The same upload twice (a double click, a retry): one meeting.
  const existing = db.prepare('SELECT id FROM meetings WHERE audio_file_id = ?').get(fileId) as { id: number } | undefined;
  if (existing) {
    res.status(200).json(getMeeting(existing.id));
    return;
  }

  const typed = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
  const id = createMeeting(user.id, {
    title: typed || 'Meeting (writing notes…)',
    audioFileId: fileId,
    audioUrl: meta.item.webViewLink,
    attendees,
    speakerCount,
  });
  enqueue(id);
  res.status(201).json(getMeeting(id));
});

/** Runs a failed meeting again, from the step that failed. Only whoever recorded it (their Google account is used). */
meetingsRouter.post('/:id/retry', enabled, (req, res) => {
  const id = Number(req.params.id);
  const row = getRow(id);
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (row.user_id !== res.locals.user!.id) {
    res.status(403).json({ error: 'Only the person who recorded this meeting can retry it' });
    return;
  }
  if (row.status !== 'failed') {
    res.status(409).json({ error: 'This meeting is not in a failed state' });
    return;
  }
  patchMeeting(id, { status: 'uploaded', error: null });
  enqueue(id);
  res.json(getMeeting(id));
});

const meetingErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if (!(err instanceof DriveError)) return next(err);
  if (err.status >= 500) console.error('[meetings]', err.message);
  res.status(err.status).json({ error: err.message });
};
meetingsRouter.use(meetingErrors);
