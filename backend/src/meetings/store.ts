// The `meetings` table.
import { db } from '../db';

export type MeetingStatus = 'uploaded' | 'transcribing' | 'writing' | 'done' | 'failed';
export const IN_PROGRESS: MeetingStatus[] = ['uploaded', 'transcribing', 'writing'];

interface MeetingRow {
  id: number;
  user_id: number;
  title: string;
  status: MeetingStatus;
  error: string | null;
  audio_file_id: string;
  audio_url: string | null;
  attendees_json: string;
  speaker_count: number | null;
  duration_sec: number | null;
  language: string | null;
  transcript_json: string | null;
  doc_id: string | null;
  doc_url: string | null;
  timings_json: string;
  created_at: string;
  updated_at: string;
  recorded_by?: string;
}

/** What the portal sees. */
export interface Meeting {
  id: number;
  /** Who recorded it; only they can retry it. */
  user_id: number;
  title: string;
  status: MeetingStatus;
  /** Why it failed, when it did. */
  error: string | null;
  audio_url: string | null;
  attendees: string[];
  speaker_count: number | null;
  duration_sec: number | null;
  doc_url: string | null;
  /** Seconds each step took. */
  timings: Record<string, number>;
  recorded_by: string;
  created_at: string;
  updated_at: string;
}

const SELECT = 'SELECT m.*, u.name AS recorded_by FROM meetings m JOIN users u ON u.id = m.user_id';

function toMeeting(r: MeetingRow): Meeting {
  return {
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    status: r.status,
    error: r.error,
    audio_url: r.audio_url,
    attendees: JSON.parse(r.attendees_json) as string[],
    speaker_count: r.speaker_count,
    duration_sec: r.duration_sec,
    doc_url: r.doc_url,
    timings: JSON.parse(r.timings_json) as Record<string, number>,
    recorded_by: r.recorded_by ?? '',
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export const getRow = (id: number) => db.prepare(`${SELECT} WHERE m.id = ?`).get(id) as MeetingRow | undefined;

export function getMeeting(id: number): Meeting | null {
  const row = getRow(id);
  return row ? toMeeting(row) : null;
}

export function listMeetings(limit = 50): Meeting[] {
  return (db.prepare(`${SELECT} ORDER BY m.created_at DESC, m.id DESC LIMIT ?`).all(limit) as unknown as MeetingRow[]).map(toMeeting);
}

export function createMeeting(
  userId: number,
  m: { title: string; audioFileId: string; audioUrl: string | null; attendees: string[]; speakerCount: number | null },
): number {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO meetings (user_id, title, audio_file_id, audio_url, attendees_json, speaker_count) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, m.title, m.audioFileId, m.audioUrl, JSON.stringify(m.attendees), m.speakerCount);
  return Number(lastInsertRowid);
}

type Patch = Partial<Pick<MeetingRow, 'title' | 'status' | 'error' | 'speaker_count' | 'duration_sec' | 'language' | 'transcript_json' | 'doc_id' | 'doc_url' | 'timings_json'>>;

export function patchMeeting(id: number, fields: Patch): void {
  const keys = Object.keys(fields) as (keyof Patch)[];
  if (keys.length === 0) return;
  db.prepare(`UPDATE meetings SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(
    ...keys.map((k) => fields[k] ?? null),
    id,
  );
}

/** After a restart nothing is running any more: whatever was in flight failed. */
export function failInterrupted(): number {
  const marks = IN_PROGRESS.map(() => '?').join(', ');
  return Number(
    db
      .prepare(`UPDATE meetings SET status = 'failed', error = 'Interrupted by a server restart. Retry to continue.' WHERE status IN (${marks})`)
      .run(...IN_PROGRESS).changes,
  );
}
