// Jarvis MCP tools. Each tool reads the plan, optionally returns an edited copy,
// and a JSON-friendly result for Claude.
import { COLORS, todayStr, uid, type Bucket, type Goal, type Milestone, type PlanData, type Priority, type Task } from '../../src/lib/core.ts';
import { addDays, computeSchedule, type Schedule } from '../../src/lib/schedule-core.ts';

type Args = Record<string, unknown>;
export interface ToolOutput {
  result: unknown;
  next?: PlanData;
}
interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly?: boolean;
  destructive?: boolean;
  run: (plan: PlanData, args: Args) => ToolOutput;
}

class UserError extends Error {}

// ---------- helpers ----------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const tzOf = (p: PlanData) => p.prefs.timezone || 'UTC';
const today = (p: PlanData) => todayStr(0, tzOf(p));
const sched = (p: PlanData): Schedule => computeSchedule(p, today(p), tzOf(p));
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const optDate = (v: unknown, field: string): string | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = str(v);
  if (s === '') return '';
  if (!DATE.test(s)) throw new UserError(`${field} must be YYYY-MM-DD (or "" to clear).`);
  return s;
};
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function find<T extends { id: string }>(list: T[], key: unknown, label: (x: T) => string, kind: string): T {
  const k = str(key);
  if (!k) throw new UserError(`Missing ${kind}.`);
  const byId = list.find((x) => x.id === k);
  if (byId) return byId;
  const exact = list.filter((x) => norm(label(x)) === norm(k));
  if (exact.length === 1) return exact[0];
  const partial = list.filter((x) => norm(label(x)).includes(norm(k)));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new UserError(`"${k}" matches several ${kind}s: ${partial.map((x) => `${label(x)} (${x.id})`).join('; ')}. Use an id.`);
  throw new UserError(`No ${kind} matches "${k}".`);
}
const findBucket = (p: PlanData, k: unknown) => find(p.buckets, k, (b) => b.name, 'bucket');
const findGoal = (p: PlanData, k: unknown) => find(p.goals, k, (g) => g.title, 'goal');
const findMs = (p: PlanData, k: unknown) => find(p.milestones, k, (m) => m.title, 'milestone');
const findTask = (p: PlanData, k: unknown) => find(p.tasks, k, (t) => t.title, 'task');

function describeTask(p: PlanData, t: Task, s: Schedule, full = false) {
  const pl = s.tasks.get(t.id);
  const out: Record<string, unknown> = {
    id: t.id,
    title: t.title,
    bucket: p.buckets.find((b) => b.id === t.bucketId)?.name,
  };
  const g = p.goals.find((x) => x.id === t.goalId);
  const m = p.milestones.find((x) => x.id === t.milestoneId);
  if (g) out.goal = g.title;
  if (m) out.milestone = m.title;
  if (t.done) out.done = true;
  if (!t.done && pl) {
    out.planned_for = pl.date;
    if (pl.pinned) out.pinned = true;
    if (pl.deadline) out.deadline = pl.deadline;
    if (pl.late) out.late = true;
  } else if (t.due) out.deadline = t.due;
  if (t.priority) out.priority = ['auto', 'high', 'medium', 'low'][t.priority];
  if (t.notes) out.notes = full ? t.notes : t.notes.length > 140 ? t.notes.slice(0, 140) + '…' : t.notes;
  if (full) {
    out.bucket_id = t.bucketId;
    if (g) out.goal_id = g.id;
    if (m) out.milestone_id = m.id;
    if (t.due) out.own_deadline = t.due;
  }
  return out;
}

function newTask(p: PlanData, a: Args): Task {
  const title = str(a.title);
  if (!title) throw new UserError('Each task needs a title.');
  let ms: Milestone | undefined;
  let goal: Goal | undefined;
  let bucket: Bucket | undefined;
  if (a.milestone) ms = findMs(p, a.milestone);
  if (ms) goal = p.goals.find((g) => g.id === ms!.goalId);
  else if (a.goal) goal = findGoal(p, a.goal);
  if (goal) bucket = p.buckets.find((b) => b.id === goal!.bucketId);
  else if (a.bucket) bucket = findBucket(p, a.bucket);
  if (!bucket) throw new UserError(`Task "${title}" needs a bucket, goal or milestone. Buckets: ${p.buckets.map((b) => b.name).join(', ')}.`);
  const pr = Number(a.priority ?? 0);
  return {
    id: uid(),
    bucketId: bucket.id,
    goalId: goal?.id ?? '',
    milestoneId: ms?.id ?? '',
    title,
    due: optDate(a.due, 'due') ?? '',
    doDate: optDate(a.do_date, 'do_date') ?? '',
    priority: ([0, 1, 2, 3].includes(pr) ? pr : 0) as Priority,
    notes: str(a.notes),
    done: false,
    doneAt: 0,
    createdAt: Date.now(),
  };
}

const PRIORITY = { type: 'integer', enum: [0, 1, 2, 3], description: '0 auto (default), 1 high, 2 medium, 3 low' };
const REF = (what: string) => ({ type: 'string', description: `${what} id or name (case-insensitive; a unique partial name works)` });

// ---------- tools ----------
export const TOOLS: ToolDef[] = [
  {
    name: 'get_overview',
    title: 'Plan overview',
    description:
      "The whole plan at a glance: buckets, each active goal with progress, target date, Jarvis's projected finish and next milestone, plus how many tasks are open and what is planned today. Start here when you need context.",
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    run: (p) => {
      const s = sched(p);
      const t = today(p);
      return {
        result: {
          today: t,
          daily_capacity: p.prefs.dailyCapacity,
          buckets: p.buckets.map((b) => ({
            id: b.id,
            name: b.name,
            open_tasks: p.tasks.filter((x) => x.bucketId === b.id && !x.done).length,
            goals: p.goals
              .filter((g) => g.bucketId === b.id && !g.done)
              .map((g) => {
                const gp = s.goals.get(g.id)!;
                return {
                  id: g.id,
                  title: g.title,
                  progress: `${gp.done}/${gp.total} (${gp.pct}%)`,
                  ...(g.targetDate ? { target: g.targetDate } : { target: 'none set' }),
                  ...(gp.projected ? { projected_finish: gp.projected } : {}),
                  ...(gp.slipDays ? { behind_by_days: gp.slipDays } : {}),
                  ...(gp.nextMilestone ? { next_milestone: gp.nextMilestone.title, next_milestone_date: gp.nextMilestone.date || undefined } : {}),
                  milestones: p.milestones.filter((m) => m.goalId === g.id).map((m) => ({ id: m.id, title: m.title, ...(m.dueDate ? { due: m.dueDate } : {}), ...(m.done ? { done: true } : {}) })),
                };
              }),
          })),
          planned_today: (s.byDay.get(t) ?? []).map((x) => describeTask(p, x, s)),
        },
      };
    },
  },
  {
    name: 'get_schedule',
    title: 'Scheduled tasks by day',
    description: "Tasks Jarvis has scheduled, day by day. Defaults to today only. Use days=7 for the week. Overdue work is always scheduled on today.",
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD (default today)' },
        days: { type: 'integer', minimum: 1, maximum: 31, description: 'How many days (default 1)' },
      },
    },
    readOnly: true,
    run: (p, a) => {
      const s = sched(p);
      const from = optDate(a.from, 'from') || today(p);
      const n = Math.min(31, Math.max(1, Number(a.days ?? 1)));
      const days = Array.from({ length: n }, (_, i) => addDays(from, i)).map((d) => ({ date: d, tasks: (s.byDay.get(d) ?? []).map((t) => describeTask(p, t, s)) }));
      return { result: { today: today(p), days } };
    },
  },
  {
    name: 'search_tasks',
    title: 'Search tasks',
    description:
      'Find tasks by words in the title or notes, optionally within a bucket or goal. Use this to locate a task before reading or changing it (for example "Elaina").',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for (all must appear). Leave empty to list.' },
        bucket: REF('Bucket'),
        goal: REF('Goal'),
        include_done: { type: 'boolean', description: 'Also return finished tasks (default false)' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Default 25' },
      },
    },
    readOnly: true,
    run: (p, a) => {
      const s = sched(p);
      const words = norm(str(a.query)).split(' ').filter(Boolean);
      const b = a.bucket ? findBucket(p, a.bucket) : undefined;
      const g = a.goal ? findGoal(p, a.goal) : undefined;
      const hits = p.tasks
        .filter((t) => (a.include_done ? true : !t.done))
        .filter((t) => (!b || t.bucketId === b.id) && (!g || t.goalId === g.id))
        .filter((t) => {
          const hay = norm(`${t.title} ${t.notes}`);
          return words.every((w) => hay.includes(w));
        })
        .sort((x, y) => (s.tasks.get(x.id)?.date ?? '9999').localeCompare(s.tasks.get(y.id)?.date ?? '9999'));
      const limit = Math.min(100, Number(a.limit ?? 25));
      return { result: { count: hits.length, tasks: hits.slice(0, limit).map((t) => describeTask(p, t, s)) } };
    },
  },
  {
    name: 'get_task',
    title: 'Get a task',
    description: 'Everything about one task: full notes, bucket, goal, milestone, planned day and deadline.',
    inputSchema: { type: 'object', properties: { id: REF('Task') }, required: ['id'] },
    readOnly: true,
    run: (p, a) => ({ result: describeTask(p, findTask(p, a.id), sched(p), true) }),
  },
  {
    name: 'add_tasks',
    title: 'Add tasks',
    description:
      'Add one or more tasks, in the order they should be done. Each needs a bucket, goal or milestone. Only set "due" for a real deadline; Jarvis schedules the day itself unless you pin do_date.',
    inputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Short, actionable, under 2 hours of work' },
              bucket: REF('Bucket'),
              goal: REF('Goal'),
              milestone: REF('Milestone'),
              due: { type: 'string', description: 'Hard deadline YYYY-MM-DD' },
              do_date: { type: 'string', description: 'Pin to this day YYYY-MM-DD' },
              notes: { type: 'string', description: 'Details, links, drafts' },
              priority: PRIORITY,
            },
            required: ['title'],
          },
        },
      },
      required: ['tasks'],
    },
    run: (p, a) => {
      const list = Array.isArray(a.tasks) ? (a.tasks as Args[]) : [];
      if (!list.length) throw new UserError('tasks must be a non-empty list.');
      const now = Date.now();
      const created = list.map((x, i) => ({ ...newTask(p, x), createdAt: now + i }));
      const next = { ...p, tasks: [...p.tasks, ...created] };
      const s = sched(next);
      return { next, result: { added: created.map((t) => describeTask(next, t, s)) } };
    },
  },
  {
    name: 'update_task',
    title: 'Update a task',
    description:
      'Change a task: title, deadline, pinned day, notes (replace with notes, or add a dated line with append_note), priority, done, or move it to another bucket/goal/milestone. Use "" to clear a date. After doing work for a task (for example drafting an email), record it with append_note.',
    inputSchema: {
      type: 'object',
      properties: {
        id: REF('Task'),
        title: { type: 'string' },
        due: { type: 'string', description: 'YYYY-MM-DD or "" to clear' },
        do_date: { type: 'string', description: 'Pin to a day YYYY-MM-DD, or "" to let Jarvis schedule it' },
        notes: { type: 'string', description: 'Replaces all notes' },
        append_note: { type: 'string', description: 'Adds a dated line to the notes' },
        priority: PRIORITY,
        done: { type: 'boolean' },
        bucket: REF('Bucket'),
        goal: REF('Goal (or "" to detach)'),
        milestone: REF('Milestone (or "" to detach)'),
      },
      required: ['id'],
    },
    run: (p, a) => {
      const t = findTask(p, a.id);
      const u: Task = { ...t };
      if (a.title !== undefined) u.title = str(a.title) || t.title;
      const due = optDate(a.due, 'due');
      if (due !== undefined) u.due = due;
      const dd = optDate(a.do_date, 'do_date');
      if (dd !== undefined) u.doDate = dd;
      if (a.notes !== undefined) u.notes = String(a.notes);
      if (str(a.append_note)) u.notes = (u.notes ? u.notes + '\n' : '') + `[${today(p)}] ${str(a.append_note)}`;
      if (a.priority !== undefined && [0, 1, 2, 3].includes(Number(a.priority))) u.priority = Number(a.priority) as Priority;
      if (typeof a.done === 'boolean' && a.done !== t.done) {
        u.done = a.done;
        u.doneAt = a.done ? Date.now() : 0;
      }
      if (a.milestone !== undefined) {
        if (str(a.milestone) === '') u.milestoneId = '';
        else {
          const m = findMs(p, a.milestone);
          const g = p.goals.find((x) => x.id === m.goalId)!;
          Object.assign(u, { milestoneId: m.id, goalId: g.id, bucketId: g.bucketId });
        }
      }
      if (a.goal !== undefined && a.milestone === undefined) {
        if (str(a.goal) === '') Object.assign(u, { goalId: '', milestoneId: '' });
        else {
          const g = findGoal(p, a.goal);
          Object.assign(u, { goalId: g.id, bucketId: g.bucketId, milestoneId: '' });
        }
      }
      if (a.bucket !== undefined && a.goal === undefined && a.milestone === undefined) {
        const b = findBucket(p, a.bucket);
        if (b.id !== u.bucketId) Object.assign(u, { bucketId: b.id, goalId: '', milestoneId: '' });
      }
      const next = { ...p, tasks: p.tasks.map((x) => (x.id === t.id ? u : x)) };
      return { next, result: { updated: describeTask(next, u, sched(next), true) } };
    },
  },
  {
    name: 'complete_task',
    title: 'Complete a task',
    description: 'Mark a task done, optionally adding a note about what was done.',
    inputSchema: { type: 'object', properties: { id: REF('Task'), note: { type: 'string' } }, required: ['id'] },
    run: (p, a) => {
      const t = findTask(p, a.id);
      const notes = str(a.note) ? (t.notes ? t.notes + '\n' : '') + `[${today(p)}] ${str(a.note)}` : t.notes;
      const u = { ...t, done: true, doneAt: Date.now(), notes };
      const next = { ...p, tasks: p.tasks.map((x) => (x.id === t.id ? u : x)) };
      return { next, result: { completed: u.title, id: u.id } };
    },
  },
  {
    name: 'delete_task',
    title: 'Delete a task',
    description: 'Permanently delete a task. Only when the user asks to delete it; prefer complete_task for finished work.',
    inputSchema: { type: 'object', properties: { id: REF('Task') }, required: ['id'] },
    destructive: true,
    run: (p, a) => {
      const t = findTask(p, a.id);
      return { next: { ...p, tasks: p.tasks.filter((x) => x.id !== t.id) }, result: { deleted: t.title } };
    },
  },
  {
    name: 'add_goal',
    title: 'Add a goal',
    description: 'Add a goal to a bucket, optionally with milestones and their tasks in one go (in order).',
    inputSchema: {
      type: 'object',
      properties: {
        bucket: REF('Bucket'),
        title: { type: 'string' },
        target_date: { type: 'string', description: 'YYYY-MM-DD' },
        why: { type: 'string' },
        milestones: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, due_date: { type: 'string' }, tasks: { type: 'array', items: { type: 'string' } } },
            required: ['title'],
          },
        },
      },
      required: ['bucket', 'title'],
    },
    run: (p, a) => {
      const b = findBucket(p, a.bucket);
      const now = Date.now();
      const g: Goal = { id: uid(), bucketId: b.id, title: str(a.title), why: str(a.why), targetDate: optDate(a.target_date, 'target_date') ?? '', done: false, createdAt: now };
      if (!g.title) throw new UserError('Goal needs a title.');
      const ms: Milestone[] = [];
      const ts: Task[] = [];
      (Array.isArray(a.milestones) ? (a.milestones as Args[]) : []).forEach((m, i) => {
        const mm: Milestone = { id: uid(), goalId: g.id, title: str(m.title), dueDate: optDate(m.due_date, 'due_date') ?? '', done: false, createdAt: now + i };
        ms.push(mm);
        (Array.isArray(m.tasks) ? m.tasks : []).forEach((title, j) =>
          ts.push({ id: uid(), bucketId: b.id, goalId: g.id, milestoneId: mm.id, title: str(title), due: '', doDate: '', priority: 0, notes: '', done: false, doneAt: 0, createdAt: now + i * 100 + j }),
        );
      });
      const next = { ...p, goals: [...p.goals, g], milestones: [...p.milestones, ...ms], tasks: [...p.tasks, ...ts] };
      return { next, result: { goal: { id: g.id, title: g.title }, milestones: ms.map((m) => ({ id: m.id, title: m.title })), tasks_added: ts.length } };
    },
  },
  {
    name: 'update_goal',
    title: 'Update a goal',
    description: 'Change a goal title, target date (YYYY-MM-DD or "" to clear), why, or mark it done.',
    inputSchema: {
      type: 'object',
      properties: { id: REF('Goal'), title: { type: 'string' }, target_date: { type: 'string' }, why: { type: 'string' }, done: { type: 'boolean' } },
      required: ['id'],
    },
    run: (p, a) => {
      const g = findGoal(p, a.id);
      const u: Goal = { ...g };
      if (str(a.title)) u.title = str(a.title);
      const td = optDate(a.target_date, 'target_date');
      if (td !== undefined) u.targetDate = td;
      if (a.why !== undefined) u.why = String(a.why);
      if (typeof a.done === 'boolean') u.done = a.done;
      return { next: { ...p, goals: p.goals.map((x) => (x.id === g.id ? u : x)) }, result: { updated: u } };
    },
  },
  {
    name: 'add_milestone',
    title: 'Add a milestone',
    description: 'Add a milestone to a goal.',
    inputSchema: { type: 'object', properties: { goal: REF('Goal'), title: { type: 'string' }, due_date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['goal', 'title'] },
    run: (p, a) => {
      const g = findGoal(p, a.goal);
      const m: Milestone = { id: uid(), goalId: g.id, title: str(a.title), dueDate: optDate(a.due_date, 'due_date') ?? '', done: false, createdAt: Date.now() };
      if (!m.title) throw new UserError('Milestone needs a title.');
      return { next: { ...p, milestones: [...p.milestones, m] }, result: { added: m } };
    },
  },
  {
    name: 'update_milestone',
    title: 'Update a milestone',
    description: 'Change a milestone title, due date (YYYY-MM-DD or "" to clear), or mark it done.',
    inputSchema: { type: 'object', properties: { id: REF('Milestone'), title: { type: 'string' }, due_date: { type: 'string' }, done: { type: 'boolean' } }, required: ['id'] },
    run: (p, a) => {
      const m = findMs(p, a.id);
      const u: Milestone = { ...m };
      if (str(a.title)) u.title = str(a.title);
      const dd = optDate(a.due_date, 'due_date');
      if (dd !== undefined) u.dueDate = dd;
      if (typeof a.done === 'boolean') u.done = a.done;
      return { next: { ...p, milestones: p.milestones.map((x) => (x.id === m.id ? u : x)) }, result: { updated: u } };
    },
  },
  {
    name: 'add_bucket',
    title: 'Add a bucket',
    description: 'Add a new bucket (a big area of life, like a class, a project or health).',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    run: (p, a) => {
      const name = str(a.name);
      if (!name) throw new UserError('Bucket needs a name.');
      const b: Bucket = { id: uid(), name, color: COLORS[p.buckets.length % COLORS.length], createdAt: Date.now() };
      return { next: { ...p, buckets: [...p.buckets, b] }, result: { added: { id: b.id, name: b.name } } };
    },
  },
];

export { UserError };
