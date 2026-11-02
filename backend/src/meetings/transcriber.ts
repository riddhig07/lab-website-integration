// Client for the transcriber service (transcriber/): WhisperX speech-to-text
// plus pyannote speaker diarization. It works as a job queue, since a long
// meeting takes far longer than an HTTP request should stay open.
import { config } from '../config';

export interface Segment {
  /** Diarization label such as SPEAKER_00. */
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  language: string;
  duration: number;
  segments: Segment[];
}

export const transcriberEnabled = Boolean(config.meetings.transcriberUrl);

export class TranscriberError extends Error {}

const POLL_MS = 4000;
// Give up on a job after this long (CPU transcription of a long meeting is slow).
const MAX_WAIT_MS = 3 * 60 * 60 * 1000;

const headers = (): Record<string, string> => (config.meetings.transcriberToken ? { Authorization: `Bearer ${config.meetings.transcriberToken}` } : {});

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${config.meetings.transcriberUrl}${path}`, { ...init, headers: { ...headers(), ...init.headers }, signal: AbortSignal.timeout(10 * 60 * 1000) });
  } catch (err) {
    throw new TranscriberError(`The transcriber is not reachable (${err instanceof Error ? err.message : err})`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string; error?: string };
    throw new TranscriberError(`The transcriber returned ${res.status}: ${body.detail ?? body.error ?? res.statusText}`);
  }
  return res;
}

/** Transcribes `audio`, calling `onStage` as the service moves through its steps. */
export async function transcribe(
  audio: Blob,
  filename: string,
  options: { speakers?: number | null; onStage?: (stage: string) => void } = {},
): Promise<Transcript> {
  if (!transcriberEnabled) throw new TranscriberError('The transcriber is not set up (MEETINGS_TRANSCRIBER_URL).');
  const form = new FormData();
  form.append('audio', audio, filename);
  if (options.speakers) form.append('num_speakers', String(options.speakers));
  const { id } = (await (await call('/jobs', { method: 'POST', body: form })).json()) as { id: string };

  const deadline = Date.now() + MAX_WAIT_MS;
  let lastStage = '';
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const job = (await (await call(`/jobs/${id}`)).json()) as {
      status: 'queued' | 'running' | 'done' | 'failed';
      stage?: string;
      error?: string;
      result?: Transcript;
    };
    if (job.stage && job.stage !== lastStage) {
      lastStage = job.stage;
      options.onStage?.(job.stage);
    }
    if (job.status === 'failed') throw new TranscriberError(job.error ?? 'Transcription failed');
    if (job.status === 'done' && job.result) {
      await call(`/jobs/${id}`, { method: 'DELETE' }).catch(() => undefined);
      return job.result;
    }
  }
  throw new TranscriberError('Transcription took too long and was abandoned');
}
