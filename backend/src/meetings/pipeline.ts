// Recording -> notes: download the audio from Drive, transcribe it with
// speaker labels, have Claude write the notes, save them as a Google Doc and
// tell the person who recorded. One meeting at a time; progress is kept in the
// `meetings` table so the portal can show it and a failed step can be retried.
import { config } from '../config';
import { db } from '../db';
import { download, DriveError } from '../google/drive';
import { createDocFromHtml } from '../google/driveWrite';
import { postMessage, slackDmEnabled } from '../slack/client';
import { memberByLogin } from '../tracker/people';
import { TZ } from '../tracker/time';
import { docTitle, renderDoc, speakerNames } from './doc';
import { meetingFolders } from './folders';
import { notesErrorMessage, writeNotes } from './notes';
import { failInterrupted, getRow, patchMeeting } from './store';
import { transcribe, TranscriberError, type Transcript } from './transcriber';
import { toTurns } from './transcript';

const localDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, dateStyle: 'short' }).format(new Date(iso));

let queue: Promise<void> = Promise.resolve();

/** Runs the pipeline for a meeting after any already waiting. Never rejects. */
export function enqueue(id: number): void {
  queue = queue.then(() => run(id)).catch((err) => console.error('[meetings] unexpected:', err));
}

/** Call once at startup. */
export function recoverInterrupted(): void {
  const n = failInterrupted();
  if (n) console.warn(`[meetings] ${n} meeting${n === 1 ? ' was' : 's were'} interrupted by the restart; marked failed.`);
}

const seconds = (since: number) => Math.round((Date.now() - since) / 100) / 10;

async function run(id: number): Promise<void> {
  const row = getRow(id);
  if (!row) return;
  const timings = JSON.parse(row.timings_json) as Record<string, number>;
  const save = () => patchMeeting(id, { timings_json: JSON.stringify(timings) });

  try {
    // 1. Transcript (skipped when an earlier attempt already got this far).
    let transcript: Transcript;
    if (row.transcript_json) {
      transcript = JSON.parse(row.transcript_json) as Transcript;
    } else {
      patchMeeting(id, { status: 'transcribing', error: null });
      const t0 = Date.now();
      const file = await download(row.audio_file_id);
      const audio = await new Response(file.body).blob();
      timings.download_s = seconds(t0);
      const t1 = Date.now();
      transcript = await transcribe(audio, file.filename, { speakers: row.speaker_count });
      timings.transcribe_s = seconds(t1);
      patchMeeting(id, {
        transcript_json: JSON.stringify(transcript),
        duration_sec: transcript.duration,
        language: transcript.language,
      });
      save();
    }

    // 2. Notes.
    patchMeeting(id, { status: 'writing', error: null });
    const turns = toTurns(transcript.segments);
    const user = db.prepare('SELECT name, github_login, email FROM users WHERE id = ?').get(row.user_id) as
      | { name: string; github_login: string | null; email: string | null }
      | undefined;
    if (!user) throw new Error('The member who recorded this no longer exists');
    const attendees = JSON.parse(row.attendees_json) as string[];
    const recordedAt = localDate(row.created_at);
    const t2 = Date.now();
    const notes = await writeNotes({ turns, attendees, recordedBy: user.name, recordedAt, duration: transcript.duration });
    timings.notes_s = seconds(t2);

    // 3. The Doc.
    const t3 = Date.now();
    const login = user.github_login ? `@${user.github_login}` : (user.email ?? user.name);
    const folders = await meetingFolders(row.user_id, login);
    const identified = [...speakerNames(turns, notes).values()].filter((n) => !/^Speaker \d+$/.test(n));
    const html = renderDoc({ notes, turns, recordedAt, recordedBy: user.name, duration: transcript.duration, attendees: [...attendees, ...identified] });
    const doc = await createDocFromHtml(row.user_id, login, folders.notes, docTitle(notes, recordedAt), html);
    timings.doc_s = seconds(t3);

    patchMeeting(id, { status: 'done', error: null, title: notes.title, doc_id: doc.id, doc_url: doc.url, timings_json: JSON.stringify(timings) });
    notifyDone(user.github_login, notes.title, doc.url);
  } catch (err) {
    const message = errorText(err);
    console.error(`[meetings] #${id} failed:`, message);
    patchMeeting(id, { status: 'failed', error: message, timings_json: JSON.stringify(timings) });
  }
}

function errorText(err: unknown): string {
  if (err instanceof DriveError || err instanceof TranscriberError) return err.message;
  return notesErrorMessage(err);
}

/** DMs the person who recorded. Never throws. */
function notifyDone(login: string | null, title: string, url: string): void {
  if (!slackDmEnabled) return;
  const slackId = memberByLogin(login)?.slack_user_id;
  if (!slackId) return;
  const safe = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  postMessage(slackId, `Your meeting notes are ready: <${url}|${safe}>\n${config.siteUrl}/portal/meetings`).catch((err) =>
    console.error('[meetings] Slack DM failed:', err instanceof Error ? err.message : err),
  );
}
