// The Google Doc: notes first, the full transcript last. Written as HTML,
// which Drive converts to a Doc on upload.
import type { MeetingNotes } from './notes';
import { clock, speakerOrder, type Turn } from './transcript';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** label -> display name: the name Claude found, else "Speaker N" by order of first appearance. */
export function speakerNames(turns: Turn[], notes: MeetingNotes): Map<string, string> {
  const byLabel = new Map(notes.speakers.map((s) => [s.label, s.name?.trim() || null]));
  return new Map(speakerOrder(turns).map((label, i) => [label, byLabel.get(label) || `Speaker ${i + 1}`]));
}

export interface DocInput {
  notes: MeetingNotes;
  turns: Turn[];
  recordedAt: string;
  recordedBy: string;
  duration: number;
  /** Names picked by the person who recorded, plus anyone Claude identified. */
  attendees: string[];
}

export function docTitle(notes: MeetingNotes, recordedAt: string): string {
  return `${recordedAt.slice(0, 10)} ${notes.title}`;
}

const list = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
const section = (heading: string, body: string) => `<h2>${esc(heading)}</h2>${body}`;

export function renderDoc({ notes, turns, recordedAt, recordedBy, duration, attendees }: DocInput): string {
  const names = speakerNames(turns, notes);
  const known = notes.speakers.map((s) => s.name?.trim()).filter((n): n is string => Boolean(n));
  const people = [...new Map([...attendees, ...known].map((n) => [n.toLowerCase(), n])).values()];
  const unnamed = [...names.values()].filter((n) => /^Speaker \d+$/.test(n)).length;

  const meta = [
    `<b>Date:</b> ${esc(recordedAt.slice(0, 10))}`,
    `<b>Length:</b> ${esc(clock(duration))}`,
    `<b>Recorded by:</b> ${esc(recordedBy)}`,
    `<b>Attendees:</b> ${people.length ? esc(people.join(', ')) : 'not identified'}${unnamed ? ` (+ ${unnamed} unidentified speaker${unnamed === 1 ? '' : 's'})` : ''}`,
  ];

  const parts = [`<h1>${esc(notes.title)}</h1>`, `<p>${meta.join('<br>')}</p>`];
  if (notes.summary) parts.push(section('Summary', `<p>${esc(notes.summary)}</p>`));
  if (notes.decisions.length) parts.push(section('Decisions', list(notes.decisions)));
  if (notes.action_items.length) {
    const rows = notes.action_items
      .map((a) => `<tr><td>${esc(a.owner ?? 'Unassigned')}</td><td>${esc(a.task)}</td><td>${esc(a.due ?? '')}</td></tr>`)
      .join('');
    parts.push(section('Action items', `<table border="1" cellpadding="4" cellspacing="0"><tr><th>Who</th><th>What</th><th>When</th></tr>${rows}</table>`));
  }
  if (notes.topics.length) {
    parts.push(section('Discussion', notes.topics.map((t) => `<h3>${esc(t.heading)}</h3>${list(t.points)}`).join('')));
  }
  if (notes.open_questions.length) parts.push(section('Open questions', list(notes.open_questions)));

  const transcript = turns.map((t) => `<p><b>${esc(names.get(t.speaker) ?? t.speaker)}</b> <span style="color:#666666">[${clock(t.start)}]</span><br>${esc(t.text)}</p>`).join('');
  parts.push(
    `<h2>Transcript</h2><p><i>Automatic transcript; speaker labels and wording may contain errors.</i></p>${transcript}`,
  );
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${parts.join('')}</body></html>`;
}
