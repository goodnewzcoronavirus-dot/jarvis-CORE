// Jarvis's scheduler. Pure function of the plan: no AI, no network.
//
// 1. Every open task gets an effective deadline: the earliest of its own
//    deadline, its milestone's date and its goal's target date. Milestones
//    without a date, inside a goal that has a target, get one spread evenly
//    between today and the target, in order.
// 2. Tasks are ordered earliest-deadline-first (tasks with no deadline go
//    last), then by manual priority, then by milestone order, then age.
// 3. They're placed into days from today, filling `dailyCapacity` slots per
//    day. Pinned tasks (doDate set) and tasks finished today use up slots.
// 4. A task placed after its deadline is flagged late. Goals get a projected
//    finish date (the last day any of their tasks is planned).
import { useMemo } from 'react';
import { todayStr, type PlanData, type Task } from './plan';

export type Urgency = 'late' | 'high' | 'normal' | 'low';

export interface Planned {
  date: string; // the day Jarvis plans it (or the pinned day)
  pinned: boolean;
  deadline: string; // effective deadline, '' if none
  deadlineFrom: 'task' | 'milestone' | 'goal' | '';
  late: boolean; // planned after its deadline, or the deadline has passed
  urgency: Urgency;
}

export interface GoalProjection {
  goalId: string;
  done: number;
  total: number;
  pct: number;
  projected: string; // projected finish date, '' if nothing open
  target: string;
  slipDays: number; // >0 means projected after target
  nextMilestone: { id: string; title: string; date: string } | null;
  milestoneMarks: { id: string; title: string; date: string; done: boolean }[];
}

export interface Schedule {
  tasks: Map<string, Planned>;
  goals: Map<string, GoalProjection>;
  milestoneDates: Map<string, string>; // explicit or derived
  byDay: Map<string, Task[]>;
}

const DAY = 86400000;

export function addDays(d: string, n: number): string {
  const x = new Date(d + 'T00:00');
  x.setDate(x.getDate() + n);
  return fmt(x);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00').getTime() - new Date(a + 'T00:00').getTime()) / DAY);
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayOf(ms: number): string {
  return fmt(new Date(ms));
}

const minDate = (...ds: string[]) => ds.filter(Boolean).sort()[0] ?? '';

export function computeSchedule(plan: PlanData, today = todayStr()): Schedule {
  const cap = Math.max(1, plan.prefs?.dailyCapacity ?? 4);

  // Milestone dates: explicit, or spread across the goal's runway.
  const milestoneDates = new Map<string, string>();
  const msOrder = new Map<string, number>();
  for (const g of plan.goals) {
    const ms = plan.milestones
      .filter((m) => m.goalId === g.id)
      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.createdAt - b.createdAt);
    ms.forEach((m, i) => msOrder.set(m.id, i));
    const runway = g.targetDate ? Math.max(daysBetween(today, g.targetDate), 0) : 0;
    ms.forEach((m, i) => {
      if (m.dueDate) milestoneDates.set(m.id, m.dueDate);
      else if (g.targetDate) milestoneDates.set(m.id, addDays(today, Math.round((runway * (i + 1)) / ms.length)));
    });
  }

  const goalById = new Map(plan.goals.map((g) => [g.id, g]));
  const effective = (t: Task): { deadline: string; from: Planned['deadlineFrom'] } => {
    const msDate = t.milestoneId ? milestoneDates.get(t.milestoneId) ?? '' : '';
    const gDate = t.goalId ? goalById.get(t.goalId)?.targetDate ?? '' : '';
    const d = minDate(t.due, msDate, gDate);
    const from = !d ? '' : d === t.due ? 'task' : d === msDate ? 'milestone' : 'goal';
    return { deadline: d, from };
  };

  // Slots already used: pinned open tasks and tasks finished today.
  const used = new Map<string, number>();
  const bump = (d: string) => used.set(d, (used.get(d) ?? 0) + 1);
  for (const t of plan.tasks) {
    if (t.done && t.doneAt && dayOf(t.doneAt) === today) bump(today);
    else if (!t.done && t.doDate) bump(t.doDate < today ? today : t.doDate);
  }

  const open = plan.tasks.filter((t) => !t.done);
  const info = new Map(open.map((t) => [t.id, effective(t)]));

  // Tasks in the same milestone (or same goal, outside milestones) are treated
  // as a sequence in the order they were added: an earlier step has to be done
  // by the time any later step is due. Used for ordering only.
  const orderBy = new Map(open.map((t) => [t.id, info.get(t.id)!.deadline || '9999']));
  const groups = new Map<string, Task[]>();
  for (const t of open) {
    if (!t.goalId) continue;
    const k = t.milestoneId || `g:${t.goalId}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt);
    let running = '9999';
    for (let i = list.length - 1; i >= 0; i--) {
      const own = orderBy.get(list[i].id)!;
      running = own < running ? own : running;
      orderBy.set(list[i].id, running);
    }
  }

  const auto = open
    .filter((t) => !t.doDate)
    .sort((a, b) => {
      const da = orderBy.get(a.id)!;
      const db = orderBy.get(b.id)!;
      return (
        da.localeCompare(db) ||
        (a.priority || 2) - (b.priority || 2) ||
        (msOrder.get(a.milestoneId) ?? 99) - (msOrder.get(b.milestoneId) ?? 99) ||
        a.createdAt - b.createdAt
      );
    });

  const tasks = new Map<string, Planned>();
  let cursor = today;
  for (const t of auto) {
    while ((used.get(cursor) ?? 0) >= cap) cursor = addDays(cursor, 1);
    bump(cursor);
    tasks.set(t.id, make(t, cursor, false));
  }
  for (const t of open.filter((x) => x.doDate)) {
    tasks.set(t.id, make(t, t.doDate < today ? today : t.doDate, true));
  }

  function make(t: Task, date: string, pinned: boolean): Planned {
    const { deadline, from } = info.get(t.id)!;
    const late = !!deadline && (date > deadline || deadline < today);
    // Urgency uses the sequence-aware deadline, so step 1 is as urgent as step 3.
    const seq = orderBy.get(t.id);
    const slack = seq && seq !== '9999' ? daysBetween(today, seq) : Infinity;
    const urgency: Urgency =
      late
        ? 'late'
        : t.priority === 1 || slack <= 2
          ? 'high'
          : t.priority === 3 || (slack !== Infinity && slack > 21)
            ? 'low'
            : 'normal';
    return { date, pinned, deadline, deadlineFrom: from, late, urgency };
  }

  // Group by day for the Today view.
  const byDay = new Map<string, Task[]>();
  for (const t of open) {
    const d = tasks.get(t.id)!.date;
    byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => {
      const pa = tasks.get(a.id)!;
      const pb = tasks.get(b.id)!;
      const rank = { late: 0, high: 1, normal: 2, low: 3 };
      return rank[pa.urgency] - rank[pb.urgency] || orderBy.get(a.id)!.localeCompare(orderBy.get(b.id)!) || a.createdAt - b.createdAt;
    });
  }

  // Goal projections.
  const goals = new Map<string, GoalProjection>();
  for (const g of plan.goals) {
    const gTasks = plan.tasks.filter((t) => t.goalId === g.id);
    const ms = plan.milestones.filter((m) => m.goalId === g.id);
    // A milestone with no tasks counts as one unit of work itself.
    const emptyMs = ms.filter((m) => !gTasks.some((t) => t.milestoneId === m.id));
    const total = gTasks.length + emptyMs.length;
    const done = gTasks.filter((t) => t.done).length + emptyMs.filter((m) => m.done).length;
    const openDates = gTasks.filter((t) => !t.done).map((t) => tasks.get(t.id)?.date ?? '');
    const projected = openDates.sort().pop() ?? '';
    const marks = ms
      .map((m) => ({ id: m.id, title: m.title, date: milestoneDates.get(m.id) ?? '', done: m.done }))
      .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const next = marks.find((m) => !m.done) ?? null;
    goals.set(g.id, {
      goalId: g.id,
      done,
      total,
      pct: total ? Math.round((done / total) * 100) : 0,
      projected,
      target: g.targetDate,
      slipDays: g.targetDate && projected ? Math.max(0, daysBetween(g.targetDate, projected)) : 0,
      nextMilestone: next,
      milestoneMarks: marks,
    });
  }

  return { tasks, goals, milestoneDates, byDay };
}

export function useSchedule(plan: PlanData): Schedule {
  const today = todayStr();
  return useMemo(() => computeSchedule(plan, today), [plan, today]);
}
