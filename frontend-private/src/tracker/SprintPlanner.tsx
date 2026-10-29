import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Dialog } from '../Dialog';
import type { PlanCandidate, SprintPlanning, TaskPriority, TaskType } from '../types';
import { errorText, isSame, PRIORITIES, STATUS_LABELS, TASK_TYPES, tracker, useTracker, type PlanResult } from './api';
import { SubtaskProgress } from './SubtaskList';

interface Props {
  open: boolean;
  onClose: () => void;
  onPlanned: (result: PlanResult) => void;
}

interface NewTask {
  title: string;
  task_type: TaskType;
  priority: TaskPriority;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="plan-section">
      <h3>{title}</h3>
      {hint && <p className="muted small">{hint}</p>}
      {children}
    </section>
  );
}

function Candidate({ task, checked, onChange, tag }: { task: PlanCandidate; checked: boolean; onChange: (v: boolean) => void; tag?: string }) {
  return (
    <label className="plan-candidate">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="plan-candidate-title">{task.title}</span>
      <span className="badges">
        {task.priority !== 'none' && <span className="badge">{task.priority}</span>}
        {task.status !== 'todo' && <span className="badge">{STATUS_LABELS[task.status]}</span>}
        <SubtaskProgress done={task.subtasks_done} total={task.subtasks_total} />
        {tag && <span className="badge info">{tag}</span>}
      </span>
    </label>
  );
}

/**
 * The start-of-sprint prompt: a wrap-up of the person's last sprint, then
 * choosing what goes into this one (carry over, pull from the backlog, or new).
 */
export function SprintPlanner({ open, onClose, onPlanned }: Props) {
  const { firstName } = useTracker();
  const [data, setData] = useState<SprintPlanning | null>(null);
  const [step, setStep] = useState<'wrapup' | 'plan'>('wrapup');
  const [carry, setCarry] = useState<Set<number>>(new Set());
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [newTasks, setNewTasks] = useState<NewTask[]>([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError(null);
    setQuery('');
    setNewTasks([]);
    setDraft('');
    tracker
      .planning()
      .then((p) => {
        setData(p);
        setStep(p.previous ? 'wrapup' : 'plan');
        setCarry(new Set(p.carry_over.map((t) => t.id)));
        setPick(new Set());
      })
      .catch((e) => setError(errorText(e)));
  }, [open]);

  const backlog = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = data?.backlog ?? [];
    return (q ? rows.filter((t) => t.title.toLowerCase().includes(q)) : rows).slice(0, 60);
  }, [data, query]);

  const toggle = (set: Set<number>, id: number, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  const addDraft = () => {
    const title = draft.trim();
    if (!title) return;
    setNewTasks((prev) => [...prev, { title, task_type: 'research', priority: 'none' }]);
    setDraft('');
  };

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const pending = draft.trim() ? [...newTasks, { title: draft.trim(), task_type: 'research' as TaskType, priority: 'none' as TaskPriority }] : newTasks;
      onPlanned(await tracker.plan(data.sprint.key, { carry_over_ids: [...carry], pickup_ids: [...pick], new_tasks: pending }));
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const prev = data?.previous;
  const person = prev?.person;
  const me = data?.member;
  const done = prev?.tasks.filter((t) => t.completed) ?? [];
  const unfinished = prev?.tasks.filter((t) => !t.completed) ?? [];
  const dropped = (data?.carry_over.length ?? 0) - carry.size;
  const total = carry.size + pick.size + newTasks.length + (draft.trim() ? 1 : 0);
  const [prevName, prevDates] = (prev?.label ?? '').split(' · ');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title={!data ? 'Sprint planning' : step === 'wrapup' && prev ? `${prevName} wrap-up` : `Plan ${data.sprint.label}`}
      subtitle={
        data && step === 'wrapup' && prev
          ? `${prevDates} · here's how your sprint went.`
          : data
            ? "Choose what you're taking on this week. You can change it later from the board."
            : undefined
      }
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>
            Later
          </button>
          <div className="button-row">
            {data && me && step === 'wrapup' && prev && (
              <button type="button" onClick={() => setStep('plan')}>
                Plan this sprint →
              </button>
            )}
            {data && me && step === 'plan' && (
              <>
                {dropped > 0 && <span className="muted small">{dropped} unchecked will go back to the backlog.</span>}
                {prev && (
                  <button type="button" className="secondary" onClick={() => setStep('wrapup')} disabled={saving}>
                    Back
                  </button>
                )}
                <button type="button" onClick={() => void save()} disabled={saving}>
                  {saving ? 'Saving…' : `Start sprint · ${total} task${total === 1 ? '' : 's'}`}
                </button>
              </>
            )}
          </div>
        </>
      }
    >
      {!data && !error && <p className="muted">Loading…</p>}
      {data && !me && (
        <p className="muted">You're not on the tracker team, so there's nothing to plan. Add yourself as a member (with your GitHub username) first.</p>
      )}

      {data && me && step === 'wrapup' && prev && (
        <div className="stack">
          <div className="tiles compact">
            <div className="tile">
              <div className="tile-label">Completed</div>
              <div className="tile-value">
                {person?.completed ?? 0}/{person?.committed ?? 0}
              </div>
            </div>
            <div className="tile">
              <div className="tile-label">Subtasks done</div>
              <div className="tile-value">
                {person?.subtasks_done ?? 0}/{person?.subtasks_total ?? 0}
              </div>
            </div>
            <div className="tile">
              <div className="tile-label">Updates posted</div>
              <div className="tile-value">{person?.updates ?? 0}</div>
            </div>
            <div className="tile">
              <div className="tile-label">Commits</div>
              <div className="tile-value">{person?.commits ?? 0}</div>
            </div>
          </div>
          <Section title={`Finished (${done.length})`}>
            {done.length === 0 ? (
              <p className="muted small">Nothing marked done this sprint.</p>
            ) : (
              <ul className="plain-list">
                {done.map((t) => (
                  <li key={t.id}>
                    <span className="ok-text">✓</span> {t.title}
                    {!isSame(t.owner, me) && t.owner && <span className="muted small"> · helped {firstName(t.owner)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={`Not finished (${unfinished.length})`} hint={unfinished.length ? 'You can carry these over on the next step.' : undefined}>
            {unfinished.length === 0 ? (
              <p className="muted small">Everything you committed to got done.</p>
            ) : (
              <ul className="plain-list">
                {unfinished.map((t) => (
                  <li key={t.id}>
                    <span className="muted">○</span> {t.title} <span className="muted small">· {STATUS_LABELS[t.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {prev.updates.length > 0 && (
            <Section title="Your updates">
              <ul className="plain-list">
                {prev.updates.slice(0, 4).map((u, i) => (
                  <li key={i} className="small">
                    <span className="muted">{u.task}: </span>
                    {u.body}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {data && me && step === 'plan' && (
        <div className="stack">
          <Section
            title={`Carry over from last sprint (${data.carry_over.length})`}
            hint={
              data.carry_over.length
                ? 'Unfinished work you own. Anything you uncheck goes back to the backlog, still assigned to you.'
                : 'Nothing unfinished to carry over.'
            }
          >
            {data.carry_over.map((t) => (
              <Candidate key={t.id} task={t} checked={carry.has(t.id)} onChange={(v) => setCarry((s) => toggle(s, t.id, v))} />
            ))}
          </Section>

          {data.in_sprint.length > 0 && (
            <Section title={`Already in this sprint (${data.in_sprint.length})`}>
              <ul className="plain-list">
                {data.in_sprint.map((t) => (
                  <li key={t.id}>
                    • {t.title}
                    {!isSame(t.assignee, me) && <span className="muted small"> · your subtasks</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Pick up from the backlog" hint="Your own unscheduled tasks and unassigned ones. Picking an unassigned task assigns it to you.">
            {data.backlog.length > 6 && <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the backlog…" />}
            {data.backlog.length === 0 && <p className="muted small">The backlog is empty.</p>}
            <div className="plan-scroll">
              {backlog.map((t) => (
                <Candidate
                  key={t.id}
                  task={t}
                  checked={pick.has(t.id)}
                  onChange={(v) => setPick((s) => toggle(s, t.id, v))}
                  tag={t.assignee ? 'yours' : 'unassigned'}
                />
              ))}
            </div>
          </Section>

          <Section title="Add new tasks" hint="Created in this sprint and assigned to you.">
            {newTasks.map((t, i) => (
              <div key={i} className="plan-new">
                <span className="plan-candidate-title">{t.title}</span>
                <select
                  value={t.task_type}
                  aria-label={`Type for “${t.title}”`}
                  onChange={(e) => setNewTasks((p) => p.map((x, j) => (j === i ? { ...x, task_type: e.target.value as TaskType } : x)))}
                >
                  {TASK_TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {ty}
                    </option>
                  ))}
                </select>
                <select
                  value={t.priority}
                  aria-label={`Priority for “${t.title}”`}
                  onChange={(e) => setNewTasks((p) => p.map((x, j) => (j === i ? { ...x, priority: e.target.value as TaskPriority } : x)))}
                >
                  {PRIORITIES.map((pr) => (
                    <option key={pr} value={pr}>
                      {pr === 'none' ? '—' : pr}
                    </option>
                  ))}
                </select>
                <button type="button" className="link icon" onClick={() => setNewTasks((p) => p.filter((_, j) => j !== i))} aria-label={`Remove “${t.title}”`}>
                  ✕
                </button>
              </div>
            ))}
            <input
              value={draft}
              maxLength={300}
              placeholder="+ New task title (Enter)"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDraft();
                }
              }}
            />
          </Section>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </Dialog>
  );
}
