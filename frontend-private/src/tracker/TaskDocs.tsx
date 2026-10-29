import { useEffect, useState } from 'react';
import type { DriveItem, Task, TaskDoc } from '../types';
import { errorText, tracker } from './api';

// Google Docs, Sheets, Slides and Drive files linked to a task.

const GLYPHS: [RegExp, string, string][] = [
  [/folder$/, '📁', 'Folder'],
  [/document$|wordprocessingml|msword/, '📄', 'Doc'],
  [/spreadsheet$|spreadsheetml|ms-excel|csv/, '📊', 'Sheet'],
  [/presentation$|presentationml|ms-powerpoint/, '📽', 'Slides'],
  [/pdf$/, '📕', 'PDF'],
  [/^image\//, '🖼', 'Image'],
];

export function docGlyph(mimeType: string): { glyph: string; kind: string } {
  const hit = GLYPHS.find(([re]) => re.test(mimeType));
  return hit ? { glyph: hit[1], kind: hit[2] } : { glyph: '📎', kind: 'File' };
}

const looksLikeLink = (s: string) => /(docs|drive)\.google\.com\//.test(s);

/** Doc chips on a board card. */
export function DocPills({ task }: { task: Task }) {
  if (task.docs.length === 0) return null;
  const shown = task.docs.slice(0, 2);
  const more = task.docs.length - shown.length;
  return (
    <>
      {shown.map((d) => (
        <a key={d.id} className="badge doc-pill" href={d.url} target="_blank" rel="noreferrer" title={d.name} onClick={(e) => e.stopPropagation()}>
          {docGlyph(d.mime_type).glyph} <span className="truncate">{d.name}</span>
        </a>
      ))}
      {more > 0 && (
        <span className="badge" title={task.docs.slice(2).map((d) => d.name).join('\n')}>
          +{more} doc{more === 1 ? '' : 's'}
        </span>
      )}
    </>
  );
}

/** The task dialog's Docs section: linked files, and a box that takes a link or searches Lab Drive. */
export function DocsSection({ task, onChanged }: { task: Task; onChanged: (t: Task) => void }) {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<(DriveItem & { path: string })[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = input.trim();
  const isLink = looksLikeLink(query);

  // Typing words (not a link) searches Lab Drive, once typing pauses.
  useEffect(() => {
    if (isLink || query.length < 2) {
      setResults(null);
      return;
    }
    let stale = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      tracker
        .searchDrive(query)
        .then((r) => !stale && setResults(r.filter((f) => !f.isFolder)))
        .catch(() => !stale && setResults([]))
        .finally(() => !stale && setSearching(false));
    }, 300);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [query, isLink]);

  const run = async (fn: () => Promise<Task>) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await fn());
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const link = async (ref: { url: string } | { file_id: string }) => {
    if (await run(() => tracker.linkDoc(task.id, ref))) {
      setInput('');
      setResults(null);
    }
  };

  const linked = new Set(task.docs.map((d) => d.file_id));

  return (
    <>
      <div className="section-label">
        Docs {task.docs.length > 0 && <span className="muted small">{task.docs.length}</span>}
      </div>
      <div className="github-box">
        {task.docs.length > 0 && (
          <ul className="link-list">
            {task.docs.map((d: TaskDoc) => {
              const { glyph, kind } = docGlyph(d.mime_type);
              return (
                <li key={d.id}>
                  <span className="doc-glyph" title={kind} aria-hidden="true">
                    {glyph}
                  </span>
                  <a href={d.url} target="_blank" rel="noreferrer" className="truncate" title={d.in_lab ? `${d.name} (in Lab Drive)` : d.name}>
                    {d.name}
                  </a>
                  {d.in_lab && <span className="badge">Lab Drive</span>}
                  <button type="button" className="link icon" onClick={() => void run(() => tracker.unlinkDoc(task.id, d.id))} aria-label={`Unlink ${d.name}`} disabled={busy}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="inline-form">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste a Google Docs / Drive link, or search Lab Drive"
            aria-label="Google Docs link or Lab Drive search"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (isLink) void link({ url: query });
                else if (results?.[0]) void link({ file_id: results[0].id });
              }
            }}
          />
          {isLink && (
            <button type="button" className="secondary small" onClick={() => void link({ url: query })} disabled={busy}>
              Link
            </button>
          )}
        </div>
        {!isLink && query.length >= 2 && (
          <ul className="doc-results" aria-label="Lab Drive results">
            {searching && !results && <li className="muted small">Searching Lab Drive…</li>}
            {results?.length === 0 && <li className="muted small">Nothing in Lab Drive matches. Paste the file's link instead.</li>}
            {results?.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => void link({ file_id: f.id })} disabled={busy || linked.has(f.id)}>
                  <span aria-hidden="true">{docGlyph(f.mimeType).glyph}</span>
                  <span className="truncate">{f.name}</span>
                  <span className="muted small truncate">{linked.has(f.id) ? 'linked' : f.path.split(' / ').slice(0, -1).join(' / ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="error small">{error}</p>}
      </div>
    </>
  );
}
