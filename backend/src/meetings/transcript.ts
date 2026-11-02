// Turning the transcriber's segments into what Claude reads and what the Doc
// shows: consecutive turns by one speaker merged, labels swapped for names.
import type { Segment } from './transcriber';

export interface Turn {
  speaker: string;
  start: number;
  text: string;
}

/**
 * Merges consecutive segments by the same speaker. A segment the diarizer
 * couldn't attribute (no speaker, or UNKNOWN) joins the turn before it, since
 * those are almost always a pause-split continuation or a stray noise.
 */
export function toTurns(segments: Segment[]): Turn[] {
  const turns: Turn[] = [];
  for (const s of segments) {
    const text = s.text.trim();
    if (!text) continue;
    const last = turns.at(-1);
    const unattributed = !s.speaker || s.speaker === 'UNKNOWN';
    const speaker = unattributed ? (last?.speaker ?? 'UNKNOWN') : s.speaker;
    if (last && last.speaker === speaker) last.text += ` ${text}`;
    else turns.push({ speaker, start: s.start, text });
  }
  return turns;
}

/** 83 -> "1:23", 3725 -> "1:02:05". */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Speaker labels in the order they first speak. */
export function speakerOrder(turns: Turn[]): string[] {
  return [...new Set(turns.map((t) => t.speaker))];
}

/** The transcript as plain text for Claude: "[1:23] SPEAKER_01: ...". */
export function transcriptText(turns: Turn[]): string {
  return turns.map((t) => `[${clock(t.start)}] ${t.speaker}: ${t.text}`).join('\n');
}
