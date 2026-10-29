// Planning a sprint: each member reviews their last sprint, then picks what to
// carry over, what to pull from the backlog, and new work.
import { db } from '../db';
import { memberByLogin } from './people';
import { ensureCurrentSprint, getSummary, joinSprint, markPlanned, personalSummary, previousSprint, type PersonalSummary, type SprintInfo } from './sprints';
import { createTask, NON_CODE_TYPES, parseSubtasks, PRIORITIES, TASK_TYPES, TrackerError, type Priority, type SubtaskInput, type TaskType } from './tasks';

export interface PlanCandidate {
  id: number;
  title: string;
  assignee: string | null;
  status: string;
  priority: string;
  task_type: string;
  sprint_key: string | null;
  subtasks_total: number;
  subtasks_done: number;
}

export interface SprintPlanning {
  sprint: SprintInfo;
  /** The caller's login when they're on the team, else null (nothing to plan). */
  member: string | null;
  /** They haven't planned the current sprint yet (and there was one before it). */
  needed: boolean;
  previous: PersonalSummary | null;
  carry_over: PlanCandidate[];
  backlog: PlanCandidate[];
  in_sprint: PlanCandidate[];
}

const CANDIDATE = `SELECT t.id, t.title, t.assignee, t.status, t.priority, t.task_type, t.sprint_key,
  (SELECT COUNT(*) FROM tracker_subtasks s WHERE s.task_id = t.id) AS subtasks_total,
  (SELECT COUNT(*) FROM tracker_subtasks s WHERE s.task_id = t.id AND s.done = 1) AS subtasks_done
  FROM tracker_tasks t WHERE t.status != 'done' AND t.archived = 0`;

/** (carry-over, backlog) tasks this person may plan into the current sprint. */
function candidates(login: string, currentKey: string): { carry: PlanCandidate[]; backlog: PlanCandidate[] } {
  return {
    carry: db
      .prepare(`${CANDIDATE} AND t.assignee = ? AND t.sprint_key IS NOT NULL AND t.sprint_key != ? ORDER BY t.created_at`)
      .all(login, currentKey) as unknown as PlanCandidate[],
    backlog: db
      .prepare(`${CANDIDATE} AND t.sprint_key IS NULL AND (t.assignee = ? OR t.assignee IS NULL) ORDER BY t.created_at DESC`)
      .all(login) as unknown as PlanCandidate[],
  };
}

export function planningFor(login: string | null, now = new Date()): SprintPlanning {
  const current = ensureCurrentSprint(now);
  const member = memberByLogin(login);
  const out: SprintPlanning = { sprint: current, member: null, needed: false, previous: null, carry_over: [], backlog: [], in_sprint: [] };
  if (!member) return out;
  const me = member.github_login;
  const prev = previousSprint(current.key);
  out.member = me;
  out.needed = Boolean(prev) && !current.planned_by.some((l) => l.toLowerCase() === me.toLowerCase());
  if (prev) out.previous = personalSummary(getSummary(prev.key, now)!, me);
  const { carry, backlog } = candidates(me, current.key);
  out.carry_over = carry;
  out.backlog = backlog;
  out.in_sprint = db
    .prepare(
      `${CANDIDATE.replace("t.status != 'done' AND ", '')} AND t.sprint_key = ?
         AND (t.assignee = ? OR t.id IN (SELECT task_id FROM tracker_subtasks WHERE assignee = ?))`,
    )
    .all(current.key, me, me) as unknown as PlanCandidate[];
  return out;
}

export interface NewPlanTask {
  title: string;
  description: string | null;
  task_type: TaskType;
  priority: Priority;
  subtasks: SubtaskInput[];
}

export function parsePlan(body: unknown): { carry_over_ids: number[]; pickup_ids: number[]; new_tasks: NewPlanTask[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  const ids = (v: unknown) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > 200 || !v.every((n) => Number.isInteger(Number(n)))) throw new TrackerError(400, 'Invalid task ids');
    return v.map(Number);
  };
  const raw = b.new_tasks === undefined ? [] : b.new_tasks;
  if (!Array.isArray(raw) || raw.length > 30) throw new TrackerError(400, 'At most 30 new tasks');
  const new_tasks = raw
    .map((t: Record<string, unknown>) => ({
      title: String(t?.title ?? '').trim().slice(0, 300),
      description: String(t?.description ?? '').trim() || null,
      task_type: (TASK_TYPES.includes(t?.task_type as TaskType) ? t.task_type : 'research') as TaskType,
      priority: (PRIORITIES.includes(t?.priority as Priority) ? t.priority : 'none') as Priority,
      subtasks: parseSubtasks(t?.subtasks),
    }))
    .filter((t) => t.title);
  return { carry_over_ids: ids(b.carry_over_ids), pickup_ids: ids(b.pickup_ids), new_tasks };
}

/**
 * Commits one person's plan for the current sprint. Chosen carry-overs and
 * pickups move into the sprint (unassigned pickups become theirs), carry-over
 * candidates they left out go back to the backlog, new tasks are created in
 * the sprint, and they're marked as planned so the prompt stops showing.
 */
export function applyPlan(key: string, login: string | null, plan: ReturnType<typeof parsePlan>, now = new Date()) {
  const current = ensureCurrentSprint(now);
  if (key !== current.key) throw new TrackerError(409, 'Only the current sprint can be planned');
  const member = memberByLogin(login);
  if (!member) throw new TrackerError(403, "You're not on the tracker team");
  const me = member.github_login;
  const { carry, backlog } = candidates(me, key);
  const carryIds = new Set(carry.map((t) => t.id));
  const backlogIds = new Set(backlog.map((t) => t.id));
  const wantCarry = new Set(plan.carry_over_ids);
  const wantPick = new Set(plan.pickup_ids);
  if (![...wantCarry].every((id) => carryIds.has(id)) || ![...wantPick].every((id) => backlogIds.has(id))) {
    throw new TrackerError(400, 'Some of those tasks can no longer be planned; reload and try again');
  }

  const at = now.toISOString();
  db.exec('BEGIN');
  try {
    for (const id of wantCarry) joinSprint(id, key);
    const dropped = [...carryIds].filter((id) => !wantCarry.has(id));
    for (const id of dropped) db.prepare('UPDATE tracker_tasks SET sprint_key = NULL WHERE id = ?').run(id);
    for (const id of wantPick) {
      // Unassigned pickups become this person's; already-theirs ones just join the sprint.
      db.prepare('UPDATE tracker_tasks SET assignee = ?, updated_at = ? WHERE id = ? AND assignee IS NULL').run(me, at, id);
      joinSprint(id, key);
    }
    const created = plan.new_tasks.map(
      (t) => createTask({ ...t, assignee: me, status: 'todo', sprint_key: key }, t.subtasks, me).id,
    );
    markPlanned(key, me);
    db.exec('COMMIT');
    return {
      sprint: key,
      carried_over: wantCarry.size,
      returned_to_backlog: dropped.length,
      picked_up: wantPick.size,
      created,
      // New code tasks may match recent commits.
      link_commits: plan.new_tasks.some((t) => !NON_CODE_TYPES.has(t.task_type)),
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
