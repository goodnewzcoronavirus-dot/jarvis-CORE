// The Claude bridge. Packs the plan + a request into a prompt any Claude chat
// can work with, and applies the ```jarvis change block Claude replies with.
import { getPlan, commitPlan, uid, todayStr, type PlanData, type Task, type Goal, type Milestone, type Bucket, COLORS } from './plan';
import { computeSchedule } from './schedule';
import { streamChat } from './llm';
import type { Settings } from './settings';

// ---------- The change format ----------
export interface JarvisPatch {
  buckets?: { ref?: string; name: string }[];
  goals?: { ref?: string; bucket: string; title: string; targetDate?: string; why?: string }[];
  milestones?: { ref?: string; goal: string; title: string; dueDate?: string }[];
  tasks?: { bucket?: string; goal?: string; milestone?: string; title: string; due?: string; notes?: string; priority?: number }[];
  update?: ({ id: string } & Record<string, unknown>)[];
  delete?: string[];
}

export const FORMAT_SPEC = `Reply normally, then end with exactly ONE fenced code block whose language is \`jarvis\`, containing JSON with only the keys you need:

\`\`\`jarvis
{
  "buckets":    [{ "ref": "b1", "name": "New bucket" }],
  "goals":      [{ "ref": "g1", "bucket": "<bucket id, name or ref>", "title": "…", "targetDate": "YYYY-MM-DD", "why": "…" }],
  "milestones": [{ "ref": "m1", "goal": "<goal id or ref>", "title": "…", "dueDate": "YYYY-MM-DD" }],
  "tasks":      [{ "bucket": "<bucket id, name or ref>", "goal": "<goal id or ref, optional>", "milestone": "<milestone id or ref, optional>", "title": "…", "due": "YYYY-MM-DD only if there is a real deadline", "notes": "…" }],
  "update":     [{ "id": "<existing id>", "title": "…", "due": "…", "targetDate": "…", "dueDate": "…", "notes": "…", "done": true }],
  "delete":     ["<existing id>"]
}
\`\`\`

Rules: use existing ids from the plan when referring to existing things. Use "ref" to link new items together. Dates are YYYY-MM-DD. Only set "due" for real deadlines; Jarvis schedules do-dates itself. Keep task titles short and actionable (under 2 hours each). Put links and details in "notes". Don't delete anything unless asked.`;

// Compact, readable view of the plan for the model.
export function planForPrompt(plan: PlanData = getPlan()): string {
  const sched = computeSchedule(plan);
  const t = (x: Task) => {
    const p = sched.tasks.get(x.id);
    return {
      id: x.id,
      title: x.title,
      ...(x.done ? { done: true } : {}),
      ...(x.due ? { due: x.due } : {}),
      ...(p && !x.done ? { planned: p.date } : {}),
      ...(x.notes ? { notes: x.notes } : {}),
    };
  };
  const out = plan.buckets.map((b) => ({
    id: b.id,
    bucket: b.name,
    goals: plan.goals
      .filter((g) => g.bucketId === b.id)
      .map((g) => ({
        id: g.id,
        goal: g.title,
        ...(g.done ? { done: true } : {}),
        ...(g.targetDate ? { targetDate: g.targetDate } : {}),
        ...(g.why ? { why: g.why } : {}),
        milestones: plan.milestones
          .filter((m) => m.goalId === g.id)
          .map((m) => ({
            id: m.id,
            milestone: m.title,
            ...(m.done ? { done: true } : {}),
            ...(m.dueDate ? { dueDate: m.dueDate } : {}),
            tasks: plan.tasks.filter((x) => x.milestoneId === m.id).map(t),
          })),
        tasks: plan.tasks.filter((x) => x.goalId === g.id && !x.milestoneId).map(t),
      })),
    otherTasks: plan.tasks.filter((x) => x.bucketId === b.id && !x.goalId).map(t),
  }));
  return JSON.stringify(out);
}

export function buildPrompt(request: string): string {
  return [
    `I use an app called Jarvis to plan my life. Today is ${todayStr()} (${new Date().toLocaleDateString(undefined, { weekday: 'long' })}).`,
    '',
    'My current plan (buckets > goals > milestones > tasks, with ids; "planned" is the day Jarvis has scheduled it):',
    '```json',
    planForPrompt(),
    '```',
    '',
    `My request: ${request.trim() || 'Look over my plan. Fill gaps with concrete next tasks, add realistic deadlines where they are clearly needed, and tell me what to focus on this week.'}`,
    '',
    'Use any research or connected apps you have access to if it helps (ask me before accessing something new).',
    '',
    FORMAT_SPEC,
  ].join('\n');
}

// ---------- Parsing ----------
export function extractPatch(text: string): JarvisPatch {
  const fenced = [...text.matchAll(/```jarvis\s*([\s\S]*?)```/g)].pop()?.[1];
  let body = fenced;
  if (!body) {
    // Fall back to the last JSON object in the text.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) body = text.slice(start, end + 1);
  }
  if (!body) throw new Error('No ```jarvis block found. Paste Claude’s whole reply, including the code block at the end.');
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error('The jarvis block isn’t valid JSON. Ask Claude to resend just the block.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Unexpected format in the jarvis block.');
  return data as JarvisPatch;
}

// ---------- Preview + apply ----------
export interface Change {
  key: string;
  kind: 'add-bucket' | 'add-goal' | 'add-milestone' | 'add-task' | 'update' | 'delete' | 'complete';
  label: string;
  detail: string;
  depends?: string; // key of a change this one needs (e.g. task under a new goal)
}

interface Resolved {
  changes: Change[];
  apply: (skip: Set<string>) => PlanData;
}

export function resolvePatch(patch: JarvisPatch, base: PlanData = getPlan()): Resolved {
  const changes: Change[] = [];
  const refToKey = new Map<string, string>();
  const norm = (s: string) => s.trim().toLowerCase();

  const findBucket = (k: string) =>
    base.buckets.find((b) => b.id === k) ?? base.buckets.find((b) => norm(b.name) === norm(k ?? ''));
  const findGoal = (k: string) => base.goals.find((g) => g.id === k) ?? base.goals.find((g) => norm(g.title) === norm(k ?? ''));
  const findMs = (k: string) => base.milestones.find((m) => m.id === k) ?? base.milestones.find((m) => norm(m.title) === norm(k ?? ''));
  const nameOf = (id: string) =>
    base.buckets.find((x) => x.id === id)?.name ?? base.goals.find((x) => x.id === id)?.title ?? base.milestones.find((x) => x.id === id)?.title ?? base.tasks.find((x) => x.id === id)?.title;

  (patch.buckets ?? []).forEach((b, i) => {
    const key = `b${i}`;
    if (b.ref) refToKey.set(b.ref, key);
    changes.push({ key, kind: 'add-bucket', label: b.name, detail: 'New bucket' });
  });
  (patch.goals ?? []).forEach((g, i) => {
    const key = `g${i}`;
    if (g.ref) refToKey.set(g.ref, key);
    const parent = refToKey.get(g.bucket);
    const where = parent ? changes.find((c) => c.key === parent)?.label : findBucket(g.bucket)?.name;
    changes.push({ key, kind: 'add-goal', label: g.title, detail: `Goal in ${where ?? '?'}${g.targetDate ? ` · target ${g.targetDate}` : ''}`, depends: parent });
  });
  (patch.milestones ?? []).forEach((m, i) => {
    const key = `m${i}`;
    if (m.ref) refToKey.set(m.ref, key);
    const parent = refToKey.get(m.goal);
    const where = parent ? changes.find((c) => c.key === parent)?.label : findGoal(m.goal)?.title;
    changes.push({ key, kind: 'add-milestone', label: m.title, detail: `Milestone in ${where ?? '?'}${m.dueDate ? ` · ${m.dueDate}` : ''}`, depends: parent });
  });
  (patch.tasks ?? []).forEach((t, i) => {
    const key = `t${i}`;
    const parent = (t.milestone && refToKey.get(t.milestone)) || (t.goal && refToKey.get(t.goal)) || (t.bucket && refToKey.get(t.bucket)) || undefined;
    const where =
      (t.milestone && (findMs(t.milestone)?.title ?? changes.find((c) => c.key === refToKey.get(t.milestone!))?.label)) ||
      (t.goal && (findGoal(t.goal)?.title ?? changes.find((c) => c.key === refToKey.get(t.goal!))?.label)) ||
      (t.bucket && (findBucket(t.bucket)?.name ?? changes.find((c) => c.key === refToKey.get(t.bucket!))?.label)) ||
      '?';
    changes.push({ key, kind: 'add-task', label: t.title, detail: `Task in ${where}${t.due ? ` · due ${t.due}` : ''}`, depends: parent });
  });
  (patch.update ?? []).forEach((u, i) => {
    const name = nameOf(u.id);
    if (!name) return;
    const { id: _id, ...rest } = u;
    void _id;
    const isComplete = Object.keys(rest).length === 1 && rest.done === true;
    changes.push({
      key: `u${i}`,
      kind: isComplete ? 'complete' : 'update',
      label: name,
      detail: isComplete ? 'Mark done' : Object.entries(rest).map(([k, v]) => `${k}: ${String(v)}`).join(' · '),
    });
  });
  (patch.delete ?? []).forEach((id, i) => {
    const name = nameOf(id);
    if (name) changes.push({ key: `d${i}`, kind: 'delete', label: name, detail: 'Delete' });
  });

  const apply = (skip: Set<string>): PlanData => {
    const isSkipped = (key?: string): boolean => {
      if (!key) return false;
      if (skip.has(key)) return true;
      return isSkipped(changes.find((c) => c.key === key)?.depends);
    };
    const next: PlanData = {
      ...base,
      buckets: [...base.buckets],
      goals: [...base.goals],
      milestones: [...base.milestones],
      tasks: [...base.tasks],
    };
    const ids = new Map<string, string>(); // ref -> new id
    const now = Date.now();
    const date = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '');
    const bucketId = (k?: string) => (k ? ids.get(k) ?? findBucket(k)?.id ?? '' : '');
    const goalId = (k?: string) => (k ? ids.get(k) ?? findGoal(k)?.id ?? '' : '');
    const msId = (k?: string) => (k ? ids.get(k) ?? findMs(k)?.id ?? '' : '');

    (patch.buckets ?? []).forEach((b, i) => {
      if (isSkipped(`b${i}`)) return;
      const nb: Bucket = { id: uid(), name: b.name, color: COLORS[next.buckets.length % COLORS.length], createdAt: now + i };
      next.buckets.push(nb);
      if (b.ref) ids.set(b.ref, nb.id);
    });
    (patch.goals ?? []).forEach((g, i) => {
      if (isSkipped(`g${i}`)) return;
      const b = bucketId(g.bucket);
      if (!b) return;
      const ng: Goal = { id: uid(), bucketId: b, title: g.title, why: g.why ?? '', targetDate: date(g.targetDate), done: false, createdAt: now + i };
      next.goals.push(ng);
      if (g.ref) ids.set(g.ref, ng.id);
    });
    (patch.milestones ?? []).forEach((m, i) => {
      if (isSkipped(`m${i}`)) return;
      const gid = goalId(m.goal);
      if (!gid) return;
      const nm: Milestone = { id: uid(), goalId: gid, title: m.title, dueDate: date(m.dueDate), done: false, createdAt: now + i };
      next.milestones.push(nm);
      if (m.ref) ids.set(m.ref, nm.id);
    });
    (patch.tasks ?? []).forEach((t, i) => {
      if (isSkipped(`t${i}`)) return;
      const mid = msId(t.milestone);
      const ms = mid ? next.milestones.find((m) => m.id === mid) : undefined;
      const gid = ms?.goalId ?? goalId(t.goal);
      const goal = gid ? next.goals.find((g) => g.id === gid) : undefined;
      const bid = goal?.bucketId ?? bucketId(t.bucket) ?? '';
      if (!bid) return;
      next.tasks.push({
        id: uid(),
        bucketId: bid,
        goalId: gid || '',
        milestoneId: mid || '',
        title: t.title,
        due: date(t.due),
        doDate: '',
        priority: ([0, 1, 2, 3].includes(t.priority ?? 0) ? t.priority ?? 0 : 0) as Task['priority'],
        notes: t.notes ?? '',
        done: false,
        doneAt: 0,
        createdAt: now + i,
      });
    });
    (patch.update ?? []).forEach((u, i) => {
      if (isSkipped(`u${i}`)) return;
      const { id, ...rest } = u;
      const fix = (o: Record<string, unknown>) => {
        const r: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(o)) {
          if (['title', 'notes', 'why', 'name'].includes(k) && typeof v === 'string') r[k] = v;
          else if (['due', 'targetDate', 'dueDate', 'doDate'].includes(k) && typeof v === 'string') r[k] = date(v);
          else if (k === 'done' && typeof v === 'boolean') r[k] = v;
          else if (k === 'priority' && typeof v === 'number' && [0, 1, 2, 3].includes(v)) r[k] = v;
        }
        return r;
      };
      const p = fix(rest);
      next.tasks = next.tasks.map((t) => (t.id === id ? { ...t, ...p, ...(p.done !== undefined ? { doneAt: p.done ? Date.now() : 0 } : {}) } : t));
      next.goals = next.goals.map((g) => (g.id === id ? { ...g, ...p } : g));
      next.milestones = next.milestones.map((m) => (m.id === id ? { ...m, ...p } : m));
      next.buckets = next.buckets.map((b) => (b.id === id ? { ...b, ...p } : b));
    });
    (patch.delete ?? []).forEach((id, i) => {
      if (isSkipped(`d${i}`)) return;
      const goalIds = new Set(next.goals.filter((g) => g.id === id || g.bucketId === id).map((g) => g.id));
      const msIds = new Set(next.milestones.filter((m) => m.id === id || goalIds.has(m.goalId)).map((m) => m.id));
      next.buckets = next.buckets.filter((b) => b.id !== id);
      next.goals = next.goals.filter((g) => !goalIds.has(g.id));
      next.milestones = next.milestones.filter((m) => !msIds.has(m.id));
      next.tasks = next.tasks.filter((t) => t.id !== id && t.bucketId !== id && !goalIds.has(t.goalId) && !msIds.has(t.milestoneId));
    });
    return next;
  };

  return { changes, apply };
}

export function applyResolved(r: Resolved, skip: Set<string>) {
  commitPlan(r.apply(skip));
}

// ---------- In-app run (Haiku / any cloud model) ----------
export function canRunInApp(s: Settings): boolean {
  return (s.provider === 'anthropic' && !!s.anthropicKey) || (s.provider === 'openai' && !!s.openaiKey && !!s.openaiModel);
}

export async function runInApp(s: Settings, request: string, onText: (t: string) => void): Promise<string> {
  let out = '';
  await streamChat(
    s,
    [
      {
        role: 'system',
        content:
          'You are Jarvis, a sharp personal planning assistant. Be brief: at most 3 short sentences of advice, then the jarvis block.',
      },
      { role: 'user', content: buildPrompt(request) },
    ],
    (t) => {
      out += t;
      onText(out);
    },
    () => {},
  );
  return out;
}
