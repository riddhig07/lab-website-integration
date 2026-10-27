import { useEffect, useRef, useState } from 'react';
import { UNAUTHORIZED_EVENT } from '../api';
import { Dialog } from '../Dialog';
import { Markdown } from '../Markdown';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a turn that changed tasks, so the board refreshes. */
  onChanged: () => void;
}

interface ToolEvent {
  tool: string;
  result_summary: string;
}

type Turn = { role: 'user'; content: string } | { role: 'assistant'; content: string; tools: ToolEvent[]; error: string | null };

type StreamEvent =
  | { type: 'text'; delta: string }
  | ({ type: 'tool' } & ToolEvent)
  | { type: 'action'; op: string }
  | { type: 'done' }
  | { type: 'error'; error: string };

const SUGGESTIONS = [
  'What did everyone finish this sprint?',
  'Which P0 and P1 tasks are still open?',
  "Who's been most active on GitHub this week?",
  'Add a task for me: write the related-work section, P2, writing.',
];

const TOOL_LABELS: Record<string, string> = {
  list_team: 'Team',
  list_tasks: 'Tasks',
  get_sprint_summary: 'Sprint summary',
  get_member_stats: 'GitHub stats',
  list_repos: 'Repositories',
  list_issues: 'Issues',
  list_commits: 'Commits',
  get_commit: 'Commit',
  get_task_commits: 'Task commits',
  get_task_updates: 'Task updates',
  create_task: 'Created task',
  update_task: 'Updated task',
  add_subtasks: 'Added subtasks',
  assign_subtask: 'Assigned subtask',
  set_subtask_done: 'Subtask',
  delete_subtask: 'Removed subtask',
  post_update: 'Posted update',
  archive_tasks: 'Archive',
  link_issue: 'Linked issue',
  create_issue_from_task: 'Created issue',
  delete_task: 'Deleted task',
};

const READ_TOOLS = new Set(['list_team', 'list_tasks', 'get_sprint_summary', 'get_member_stats', 'list_repos', 'list_issues', 'list_commits', 'get_commit', 'get_task_commits', 'get_task_updates']);

/** Reads the server-sent events of one assistant turn. */
async function streamTurn(messages: { role: string; content: string }[], onEvent: (e: StreamEvent) => void, signal: AbortSignal) {
  const res = await fetch('/api/internal/tracker/ai/chat', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok || !res.body) {
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? res.statusText);
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

export function AiChat({ open, onClose, onChanged }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  const patchLast = (fn: (t: Extract<Turn, { role: 'assistant' }>) => Partial<Extract<Turn, { role: 'assistant' }>>) =>
    setTurns((curr) => {
      const last = curr[curr.length - 1];
      if (!last || last.role !== 'assistant') return curr;
      return [...curr.slice(0, -1), { ...last, ...fn(last) }];
    });

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    const history = [...turns.map((t) => ({ role: t.role, content: t.content })), { role: 'user', content }];
    setTurns((curr) => [...curr, { role: 'user', content }, { role: 'assistant', content: '', tools: [], error: null }]);
    setDraft('');
    setSending(true);
    let changed = false;
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      await streamTurn(
        history,
        (ev) => {
          if (ev.type === 'text') patchLast((t) => ({ content: t.content + ev.delta }));
          else if (ev.type === 'tool') patchLast((t) => ({ tools: [...t.tools, { tool: ev.tool, result_summary: ev.result_summary }] }));
          else if (ev.type === 'action') changed = true;
          else if (ev.type === 'error') patchLast(() => ({ error: ev.error }));
        },
        abort.signal,
      );
    } catch (err) {
      if (!abort.signal.aborted) patchLast(() => ({ error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSending(false);
      if (changed) onChanged();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="full"
      title="✨ Task board assistant"
      subtitle="Gemini, with access to the board and the lab's GitHub. It acts as you, and can create and change tasks."
      footer={
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <textarea
            rows={2}
            value={draft}
            disabled={sending}
            placeholder="Ask about the sprint, people's work or GitHub, or describe tasks to add…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
          />
          <button type="submit" disabled={sending || !draft.trim()}>
            {sending ? '…' : 'Send'}
          </button>
          {turns.length > 0 && !sending && (
            <button type="button" className="link small" onClick={() => setTurns([])}>
              New chat
            </button>
          )}
        </form>
      }
    >
      <div className="chat" ref={scrollRef}>
        {turns.length === 0 ? (
          <div className="chat-empty">
            <p className="muted">Ask about the sprint, dig into the backlog, or describe tasks to add.</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="secondary" onClick={() => void send(s)} disabled={sending}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) =>
            t.role === 'user' ? (
              <div key={i} className="chat-user">
                {t.content}
              </div>
            ) : (
              <div key={i} className="chat-assistant">
                {t.tools.length > 0 && (
                  <div className="chat-tools">
                    {t.tools.map((ev, j) => (
                      <span
                        key={j}
                        className={`badge ${ev.result_summary.startsWith('error:') ? 'bad' : READ_TOOLS.has(ev.tool) ? '' : 'ok'}`}
                        title={`${ev.tool}: ${ev.result_summary}`}
                      >
                        {TOOL_LABELS[ev.tool] ?? ev.tool} · {ev.result_summary}
                      </span>
                    ))}
                  </div>
                )}
                {t.content ? <Markdown text={t.content} /> : !t.error && sending && i === turns.length - 1 && <p className="muted">Thinking…</p>}
                {t.error && <p className="error small">{t.error}</p>}
              </div>
            ),
          )
        )}
      </div>
    </Dialog>
  );
}
