import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { api, UNAUTHORIZED_EVENT } from '../api';
import { Markdown } from '../Markdown';
import { plural } from '../format';
import { ToolCard, toolLabel, type ToolStep, type ToolView } from './ToolCard';
import './assistant.css';

/** Fired after the assistant changes tasks, so open pages can refresh. */
export const ASSISTANT_CHANGED_EVENT = 'portal:assistant-changed';

type Step = { kind: 'text'; text: string } | { kind: 'thinking'; text: string } | ToolStep;

interface Usage {
  input_tokens: number;
  output_tokens: number;
}

type Turn =
  | { role: 'user'; content: string; page: string }
  | { role: 'assistant'; steps: Step[]; error: string | null; done: boolean; ms: number; usage: Usage | null };

type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'thinking'; delta: string }
  | { type: 'tool_start'; id: string; tool: string; args: Record<string, unknown> }
  | { type: 'tool'; id: string; tool: string; args: Record<string, unknown>; ok: boolean; result_summary: string; ms: number; view: ToolView | null }
  | { type: 'action'; op: string }
  | { type: 'done'; usage: Usage }
  | { type: 'error'; error: string };

const STORAGE_KEY = 'assistant.turns';
const MODEL_NAMES: Record<string, string> = { 'claude-haiku-5-5': 'Claude Haiku 5.5', 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'claude-opus-5-5': 'Claude Opus 5.5' };

/** What the member is looking at, in words, for the composer's context chip. */
function pageLabel(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'repos' && parts.length >= 3) return parts[3] === 'issues' && parts[4] ? `${parts[2]} #${parts[4]}` : parts[2];
  if (parts[0] === 'repos') return 'Repositories';
  if (parts[0] === 'tracker') return 'Task Board';
  if (parts[0] === 'drive') return 'Lab Drive';
  if (parts.length === 0) return 'Dashboard';
  return parts[0].replace(/-/g, ' ');
}

function suggestionsFor(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'repos' && parts[3] === 'issues') return ['Summarize this issue', 'Create a task for this issue and assign it to me', 'Is any task already tracking this?'];
  if (parts[0] === 'repos' && parts.length >= 3) return ['What changed in this repo this week?', 'List the open issues and PRs here', 'Who has been committing here lately?'];
  if (parts[0] === 'repos') return ['Which repos were most active this week?', 'Show open issues across the lab', 'Any pull requests waiting on review?'];
  return ['How is the current sprint going?', 'Which P0 and P1 tasks are still open?', "Who's been most active on GitHub this week?", 'Add a task for me: write the related-work section, P2, writing'];
}

function loadTurns(): Turn[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const turns = raw ? (JSON.parse(raw) as Turn[]) : [];
    // A reply cut off by a reload is shown as finished.
    return turns.map((t) => (t.role === 'assistant' && !t.done ? { ...t, done: true } : t));
  } catch {
    return [];
  }
}

/** Reads the server-sent events of one assistant turn. */
async function streamTurn(body: unknown, onEvent: (e: StreamEvent) => void, signal: AbortSignal) {
  const res = await fetch('/api/internal/assistant/chat', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data:')) onEvent(JSON.parse(line.slice(5)) as StreamEvent);
      }
    }
  }
}

/** Appends a streamed delta to the last step of the same kind, or starts a new one. */
function appendDelta(steps: Step[], kind: 'text' | 'thinking', delta: string): Step[] {
  const last = steps[steps.length - 1];
  if (last && last.kind === kind) return [...steps.slice(0, -1), { ...last, text: last.text + delta }];
  return [...steps, { kind, text: delta }];
}

const answerText = (steps: Step[]) =>
  steps
    .filter((s): s is Extract<Step, { kind: 'text' }> => s.kind === 'text')
    .map((s) => s.text)
    .join('\n\n')
    .trim();

/** The floating assistant: a button at the bottom right of every portal page. */
export function Assistant() {
  const { pathname, search } = useLocation();
  const page = pathname + search;
  const [status, setStatus] = useState<{ enabled: boolean; model: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(loadTurns);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api<{ enabled: boolean; model: string }>('/internal/assistant')
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-30)));
    } catch {
      // Storage full or blocked: the chat just won't survive a reload.
    }
  }, [turns]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!status?.enabled) return null;

  const patchLast = (fn: (t: Extract<Turn, { role: 'assistant' }>) => Partial<Extract<Turn, { role: 'assistant' }>>) =>
    setTurns((curr) => {
      const last = curr[curr.length - 1];
      if (!last || last.role !== 'assistant') return curr;
      return [...curr.slice(0, -1), { ...last, ...fn(last) }];
    });

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    const history = [
      ...turns
        .map((t) => (t.role === 'user' ? { role: 'user', content: t.content } : { role: 'assistant', content: answerText(t.steps) }))
        .filter((m) => m.content),
      { role: 'user', content },
    ].slice(-40);
    setTurns((curr) => [...curr, { role: 'user', content, page }, { role: 'assistant', steps: [], error: null, done: false, ms: 0, usage: null }]);
    setDraft('');
    setSending(true);
    let changed = false;
    const started = Date.now();
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      await streamTurn(
        { messages: history, page },
        (ev) => {
          switch (ev.type) {
            case 'text':
            case 'thinking':
              patchLast((t) => ({ steps: appendDelta(t.steps, ev.type, ev.delta) }));
              break;
            case 'tool_start':
              patchLast((t) => ({ steps: [...t.steps, { kind: 'tool', id: ev.id, tool: ev.tool, args: ev.args, status: 'running', summary: '', ms: 0, view: null }] }));
              break;
            case 'tool':
              patchLast((t) => ({
                steps: t.steps.map((s) =>
                  s.kind === 'tool' && s.id === ev.id ? { ...s, status: ev.ok ? 'ok' : 'error', summary: ev.result_summary, ms: ev.ms, view: ev.view } : s,
                ),
              }));
              break;
            case 'action':
              changed = true;
              break;
            case 'done':
              patchLast(() => ({ usage: ev.usage }));
              break;
            case 'error':
              patchLast(() => ({ error: ev.error }));
              break;
          }
        },
        abort.signal,
      );
    } catch (err) {
      if (!abort.signal.aborted) patchLast(() => ({ error: err instanceof Error ? err.message : String(err) }));
    } finally {
      patchLast((t) => ({ done: true, ms: Date.now() - started, steps: t.steps.map((s) => (s.kind === 'tool' && s.status === 'running' ? { ...s, status: 'error', summary: 'stopped' } : s)) }));
      setSending(false);
      if (changed) window.dispatchEvent(new Event(ASSISTANT_CHANGED_EVENT));
    }
  };

  const stop = () => abortRef.current?.abort();
  const modelName = MODEL_NAMES[status.model] ?? status.model;

  return (
    <>
      {!open && (
        <button type="button" className="assistant-fab" onClick={() => setOpen(true)} aria-label="Open the assistant" title="Ask the lab assistant">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
            <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
          </svg>
          {sending && <span className="assistant-fab-dot" aria-label="working" />}
        </button>
      )}
      {open && (
        <section className={`assistant-panel${expanded ? ' expanded' : ''}`} role="dialog" aria-label="Lab assistant">
          <header className="assistant-head">
            <div>
              <strong>Lab assistant</strong>
              <div className="muted small">{modelName} · acts as you on the board and GitHub</div>
            </div>
            <div className="assistant-head-actions">
              {turns.length > 0 && !sending && (
                <button type="button" className="link small" onClick={() => setTurns([])}>
                  New chat
                </button>
              )}
              <button type="button" className="icon-button assistant-expand" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? 'Shrink' : 'Expand'} title={expanded ? 'Shrink' : 'Expand'}>
                {expanded ? '⤡' : '⤢'}
              </button>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close" title="Close (Esc)">
                ✕
              </button>
            </div>
          </header>

          <div className="assistant-body" ref={scrollRef}>
            {turns.length === 0 ? (
              <div className="assistant-empty">
                <p className="muted">Ask about the sprint, people's work or GitHub, or describe tasks to add. Each tool call it makes shows up as a card.</p>
                <div className="assistant-suggestions">
                  {suggestionsFor(pathname).map((s) => (
                    <button key={s} type="button" className="secondary" onClick={() => void send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((t, i) =>
                t.role === 'user' ? (
                  <div key={i} className="assistant-user">
                    {t.content}
                  </div>
                ) : (
                  <AssistantTurn key={i} turn={t} live={sending && i === turns.length - 1} onNavigate={() => setExpanded(false)} />
                ),
              )
            )}
          </div>

          <form
            className="assistant-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <div className="assistant-context small" title={`The assistant knows you're on ${page}`}>
              On <strong>{pageLabel(pathname)}</strong>
            </div>
            <div className="assistant-input">
              <textarea
                ref={inputRef}
                rows={2}
                value={draft}
                placeholder="Ask anything about the lab's work…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
              />
              {sending ? (
                <button type="button" className="secondary" onClick={stop}>
                  Stop
                </button>
              ) : (
                <button type="submit" disabled={!draft.trim()}>
                  Send
                </button>
              )}
            </div>
          </form>
        </section>
      )}
    </>
  );
}

function AssistantTurn({ turn, live, onNavigate }: { turn: Extract<Turn, { role: 'assistant' }>; live: boolean; onNavigate: () => void }) {
  const tools = turn.steps.filter((s) => s.kind === 'tool').length;
  const last = turn.steps[turn.steps.length - 1];
  return (
    <div className="assistant-turn">
      <ol className="assistant-steps">
        {turn.steps.map((s, i) => (
          <li key={i} className={`step ${s.kind}`}>
            {s.kind === 'text' ? (
              <Markdown text={s.text} />
            ) : s.kind === 'thinking' ? (
              <Thinking text={s.text} live={live && s === last} />
            ) : (
              <ToolCard step={s} onNavigate={onNavigate} />
            )}
          </li>
        ))}
        {live && (!last || (last.kind === 'tool' && last.status !== 'running')) && (
          <li className="step thinking">
            <span className="assistant-pending">
              <span className="spinner" /> {last ? 'Reading the results…' : 'Thinking…'}
            </span>
          </li>
        )}
      </ol>
      {turn.error && <p className="error small">{turn.error}</p>}
      {turn.done && (tools > 0 || turn.usage) && (
        <div className="assistant-turn-meta">
          {tools > 0 && <span>{plural(tools, 'tool call')}</span>}
          {turn.ms > 0 && <span>{(turn.ms / 1000).toFixed(1)} s</span>}
          {turn.usage && <span>{((turn.usage.input_tokens + turn.usage.output_tokens) / 1000).toFixed(1)}k tokens</span>}
          {tools > 0 && (
            <span className="assistant-tool-trail" title="Tools used, in order">
              {turn.steps
                .filter((s): s is ToolStep => s.kind === 'tool')
                .map((s) => toolLabel(s.tool))
                .join(' → ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Thinking({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="assistant-thinking">
      <button type="button" className="link small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {live ? <span className="spinner" /> : null} {live ? 'Thinking…' : 'Thought it through'} {open ? '▾' : '▸'}
      </button>
      {open && <p className="muted small">{text.trim() || '…'}</p>}
    </div>
  );
}
