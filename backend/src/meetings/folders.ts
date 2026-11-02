// Where meeting files live in Drive: "Meeting Notes" (the Docs) with a
// "Recordings" folder inside it (the audio).
import { config } from '../config';
import { driveRootId } from '../google/drive';
import { ensureSubfolder } from '../google/driveWrite';

export interface MeetingFolders {
  notes: string;
  recordings: string;
}

const TTL_MS = 10 * 60 * 1000;
let cached: (MeetingFolders & { at: number }) | null = null;

/** Finds or creates the folders, as the member. Remembered for a few minutes. */
export async function meetingFolders(userId: number, login: string): Promise<MeetingFolders> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached;
  const notes = config.meetings.notesFolderId || (await ensureSubfolder(userId, login, driveRootId(), 'Meeting Notes'));
  const recordings = await ensureSubfolder(userId, login, notes, 'Recordings');
  cached = { notes, recordings, at: Date.now() };
  return cached;
}
