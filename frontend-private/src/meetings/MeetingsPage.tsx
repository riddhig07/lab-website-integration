import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { connectUrl, put } from '../DriveUploads';
import { formatDateTime } from '../format';
import type { Meeting, MeetingOptions } from '../types';
import './meetings.css';

const GOOGLE_RESULTS: Record<string, { text: string; error?: boolean }> = {
  connected: { text: 'Google account connected. You can record meetings now.' },
  cancelled: { text: 'Google connection cancelled.', error: true },
  failed: { text: "Couldn't connect your Google account. Try again, and allow Google Drive access.", error: true },
  unavailable: { text: 'Uploads are not set up on this site yet.', error: true },
};

const STATUS: Record<Meeting['status'], { label: string; badge: string }> = {
  uploaded: { label: 'Queued', badge: 'info' },
  transcribing: { label: 'Transcribing…', badge: 'info' },
  writing: { label: 'Writing notes…', badge: 'info' },
  done: { label: 'Done', badge: 'ok' },
  failed: { label: 'Failed', badge: 'bad' },
};

const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
};

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `Meeting ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}`;
};

// Most browsers record webm/opus; Safari only does mp4.
const MIME_CHOICES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const extension = (mime: string) => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('webm') ? 'webm' : 'audio');

type Phase = 'idle' | 'recording' | 'sending';

/**
 * /meetings: press Record at an in-person meeting. The audio goes to Drive
 * (Meeting Notes / Recordings) from the browser, then the server transcribes it
 * with speaker labels, has Claude write the notes and saves them as a Google Doc.
 */
export function MeetingsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [options, setOptions] = useState<MeetingOptions | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [attendees, setAttendees] = useState<Set<string>>(new Set());
  const [speakers, setSpeakers] = useState('');
  const [title, setTitle] = useState('');
  // A recording that is made but not yet uploaded, kept so a failed upload can be retried.
  const [pending, setPending] = useState<{ file: File; url: string } | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const wake = useRef<WakeLockSentinel | null>(null);
  const startedAt = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadOptions = useCallback(() => {
    api<MeetingOptions>('/internal/meetings/options')
      .then(setOptions)
      .catch((e: Error) => setNotice({ text: e.message, error: true }));
  }, []);
  const loadMeetings = useCallback(() => {
    api<Meeting[]>('/internal/meetings')
      .then(setMeetings)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadOptions();
    loadMeetings();
  }, [loadOptions, loadMeetings]);

  // Back from Google's consent screen.
  useEffect(() => {
    const result = searchParams.get('google');
    if (!result) return;
    setNotice(GOOGLE_RESULTS[result] ?? null);
    loadOptions();
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, loadOptions]);

  // Keep the list fresh while anything is being worked on.
  const busy = meetings.some((m) => m.status === 'uploaded' || m.status === 'transcribing' || m.status === 'writing');
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(loadMeetings, 4000);
    return () => clearInterval(timer);
  }, [busy, loadMeetings]);

  // The timer while recording, and a warning before leaving the page mid-meeting.
  useEffect(() => {
    if (phase !== 'recording') return;
    const tick = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 500);
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => {
      clearInterval(tick);
      window.removeEventListener('beforeunload', warn);
    };
  }, [phase]);

  // Leaving the page releases the microphone.
  useEffect(
    () => () => {
      recorder.current?.state === 'recording' && recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      void wake.current?.release();
    },
    [],
  );

  /** Uploads the audio to Drive and starts the notes. */
  const send = useCallback(
    async (file: File) => {
      if (!options?.recordings_folder_id) return;
      setPhase('sending');
      setProgress(0);
      setNotice(null);
      try {
        const { upload_url } = await api<{ upload_url: string }>(`/internal/drive/folders/${encodeURIComponent(options.recordings_folder_id)}/uploads`, {
          method: 'POST',
          body: { name: file.name, mime_type: file.type, size: file.size },
        });
        const uploaded = await put(upload_url, file, (loaded) => setProgress(file.size ? loaded / file.size : 0));
        if (!uploaded.id) throw new Error('Google Drive did not confirm the upload');
        const members = options.members.filter((m) => attendees.has(m.login)).map((m) => m.name);
        await api('/internal/meetings', {
          method: 'POST',
          body: { audio_file_id: uploaded.id, title: title.trim() || undefined, attendees: members, speaker_count: Number(speakers) || undefined },
        });
        setPending((p) => {
          if (p) URL.revokeObjectURL(p.url);
          return null;
        });
        setTitle('');
        setNotice({ text: 'Uploaded. The notes will appear below in a few minutes; you will get a Slack message when they are ready.' });
        loadMeetings();
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) loadOptions();
        setNotice({ text: `${err instanceof Error ? err.message : String(err)}. Your recording is kept on this page; try again.`, error: true });
      } finally {
        setPhase('idle');
        setProgress(null);
      }
    },
    [options, attendees, speakers, title, loadMeetings, loadOptions],
  );

  const finish = useCallback(
    (mimeType: string) => {
      const type = mimeType.split(';')[0] || 'audio/webm';
      const blob = new Blob(chunks.current, { type });
      chunks.current = [];
      const file = new File([blob], `${stamp()}.${extension(type)}`, { type });
      setPending({ file, url: URL.createObjectURL(file) });
      void send(file);
    },
    [send],
  );

  const start = async () => {
    setNotice(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNotice({ text: 'This browser cannot record audio. Use a current Chrome, Edge, Firefox or Safari over https.', error: true });
      return;
    }
    try {
      // A room recording: keep the voices natural rather than filtered for a call.
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
    } catch {
      setNotice({ text: 'Microphone access was blocked. Allow it for this site in the browser, then try again.', error: true });
      return;
    }
    const mimeType = MIME_CHOICES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream.current, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined);
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    rec.onstop = () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      void wake.current?.release().catch(() => undefined);
      finish(rec.mimeType);
    };
    chunks.current = [];
    rec.start(5000);
    recorder.current = rec;
    startedAt.current = Date.now();
    setElapsed(0);
    setPhase('recording');
    // Keep a phone's screen on so the recording isn't cut off.
    navigator.wakeLock
      ?.request('screen')
      .then((lock) => (wake.current = lock))
      .catch(() => undefined);
  };

  const stop = () => recorder.current?.stop();

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setPending({ file, url: URL.createObjectURL(file) });
    void send(file);
    if (fileInput.current) fileInput.current.value = '';
  };

  const retry = async (m: Meeting) => {
    try {
      await api(`/internal/meetings/${m.id}/retry`, { method: 'POST' });
      loadMeetings();
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : String(err), error: true });
    }
  };

  const toggleAttendee = (login: string) =>
    setAttendees((current) => {
      const next = new Set(current);
      if (next.has(login)) next.delete(login);
      else next.add(login);
      return next;
    });

  const ready = Boolean(options?.enabled && options.google_email && options.recordings_folder_id);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Meetings</h1>
          <p className="muted">Press record at an in-person meeting. You get speaker-labelled notes as a Google Doc in the Meeting Notes folder.</p>
        </div>
        {options?.notes_folder_id && (
          <a className="button secondary" href={`https://drive.google.com/drive/folders/${options.notes_folder_id}`} target="_blank" rel="noreferrer">
            Open Meeting Notes folder
          </a>
        )}
      </div>

      {notice && (
        <div className={`notice ${notice.error ? 'bad' : 'ok'}`} role="status">
          <span>{notice.text}</span>
          <button type="button" className="link small" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {options && !options.enabled && (
        <div className="notice bad">
          <span>Meetings are not set up on the server yet: {options.problems.join('; ')}.</span>
        </div>
      )}

      {options?.enabled && !options.google_email && (
        <div className="notice">
          <span>Connect your Google account so the notes can be saved to the Meeting Notes folder as you.</span>
          <a className="button small" href={connectUrl('/meetings')}>
            Connect Google
          </a>
        </div>
      )}

      <section className="panel meeting-recorder" aria-label="Record a meeting">
        <div className="meeting-controls">
          {phase === 'recording' ? (
            <button type="button" className="rec-button recording" onClick={stop} aria-label="Stop recording">
              <span className="rec-dot" aria-hidden />
              <span>Stop</span>
              <span className="rec-time mono">{clock(elapsed)}</span>
            </button>
          ) : (
            <button type="button" className="rec-button" onClick={() => void start()} disabled={!ready || phase === 'sending'}>
              <span className="rec-dot" aria-hidden />
              <span>Record meeting</span>
            </button>
          )}
          <div className="meeting-status small">
            {phase === 'recording' && <span>Recording. Keep this tab open and place the phone or laptop near the middle of the table.</span>}
            {phase === 'sending' && (
              <span>
                Uploading to Drive{progress !== null ? ` · ${Math.round(progress * 100)}%` : ''}
                <span className="upload-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)}>
                  <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
                </span>
              </span>
            )}
            {phase === 'idle' && pending && (
              <span>
                Upload did not finish.{' '}
                <button type="button" className="link small" onClick={() => void send(pending.file)} disabled={!ready}>
                  Try again
                </button>{' '}
                <a href={pending.url} download={pending.file.name}>
                  Save a copy
                </a>
              </span>
            )}
            {phase === 'idle' && !pending && <span className="muted">Everyone in the room should be told they are being recorded.</span>}
          </div>
        </div>

        <details className="meeting-details">
          <summary>Options</summary>
          <div className="meeting-options">
            <div className="field">
              <label htmlFor="meeting-title">Title (optional; Claude picks one otherwise)</label>
              <input id="meeting-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={phase === 'sending'} />
            </div>
            <div className="field">
              <label htmlFor="meeting-speakers">Number of people speaking (optional; improves speaker separation)</label>
              <input
                id="meeting-speakers"
                type="number"
                min={1}
                max={20}
                value={speakers}
                onChange={(e) => setSpeakers(e.target.value)}
                disabled={phase === 'sending'}
              />
            </div>
            {options && options.members.length > 0 && (
              <fieldset className="meeting-attendees">
                <legend className="small">Who is here (helps Claude name the speakers)</legend>
                {options.members.map((m) => (
                  <label key={m.login} className="checkbox">
                    <input type="checkbox" checked={attendees.has(m.login)} onChange={() => toggleAttendee(m.login)} disabled={phase === 'sending'} />
                    {m.name}
                  </label>
                ))}
              </fieldset>
            )}
            <div>
              <input ref={fileInput} type="file" accept="audio/*,video/webm,video/mp4" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              <button type="button" className="secondary small" onClick={() => fileInput.current?.click()} disabled={!ready || phase !== 'idle'}>
                Upload an existing recording instead
              </button>
            </div>
          </div>
        </details>
      </section>

      <h2 className="meeting-list-heading">Recent meetings</h2>
      {meetings.length === 0 ? (
        <p className="muted">No meetings yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Meeting</th>
                <th>Recorded</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.title}</strong>
                    <div className="muted small">
                      {m.recorded_by}
                      {m.duration_sec ? ` · ${clock(m.duration_sec)}` : ''}
                    </div>
                  </td>
                  <td className="small">{formatDateTime(m.created_at)}</td>
                  <td>
                    <span className={`badge ${STATUS[m.status].badge}`}>{STATUS[m.status].label}</span>
                    {m.error && <div className="error small meeting-error">{m.error}</div>}
                    {m.status === 'failed' && m.user_id === user?.id && (
                      <button type="button" className="link small" onClick={() => void retry(m)}>
                        Retry
                      </button>
                    )}
                  </td>
                  <td className="small">
                    {m.doc_url ? (
                      <a href={m.doc_url} target="_blank" rel="noreferrer">
                        Open Doc
                      </a>
                    ) : (
                      '—'
                    )}
                    {m.audio_url && (
                      <>
                        {' · '}
                        <a href={m.audio_url} target="_blank" rel="noreferrer">
                          Audio
                        </a>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
