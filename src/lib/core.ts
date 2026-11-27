// Pure plan model shared by the app and the Jarvis Cloud worker.
// No React, no DOM, no localStorage in here.

export interface Bucket {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface Goal {
  id: string;
  bucketId: string;
  title: string;
  why: string;
  targetDate: string; // YYYY-MM-DD or ''
  done: boolean;
  createdAt: number;
}

export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  dueDate: string;
  done: boolean;
  createdAt: number;
}

// 0 = auto (Jarvis decides from deadlines), 1 = high, 2 = medium, 3 = low
export type Priority = 0 | 1 | 2 | 3;

export interface Task {
  id: string;
  bucketId: string;
  goalId: string; // '' if none
  milestoneId: string; // '' if none
  title: string;
  due: string; // hard deadline, YYYY-MM-DD or ''
  doDate: string; // pinned day to work on it; '' lets Jarvis schedule it
  priority: Priority;
  notes: string;
  done: boolean;
  doneAt: number;
  createdAt: number;
}

export interface Prefs {
  dailyCapacity: number; // how many tasks Jarvis plans per day
  timezone?: string; // IANA zone, so the server knows what "today" is
}

export interface PlanData {
  version: 2;
  prefs: Prefs;
  buckets: Bucket[];
  goals: Goal[];
  milestones: Milestone[];
  tasks: Task[];
}

// Bucket colors, tuned to read on the deep-blue UI. Order matches the old
// palette so existing buckets map across one-to-one.
export const COLORS = ['#3dbb8a', '#5b9dff', '#e58a52', '#b385f0', '#e3b94f', '#e8698a', '#4cc7d9', '#9aa9ba'];
export const OLD_COLORS = ['#2f6f5e', '#3f6cc4', '#b0562f', '#8a4fb5', '#b8892a', '#c2416b', '#4b7f2a', '#5b6472'];


export const EMPTY: PlanData = { version: 2, prefs: { dailyCapacity: 4 }, buckets: [], goals: [], milestones: [], tasks: [] };

// Upgrade older saves. v1 defaulted every task to "medium", which really meant
// "no opinion", so those become auto.
export function migrate(raw: Partial<PlanData> & { version?: number }): PlanData {
  const data: PlanData = { ...EMPTY, ...raw, prefs: { ...EMPTY.prefs, ...(raw.prefs ?? {}) } } as PlanData;
  if (!raw.version || raw.version < 2) {
    data.tasks = (data.tasks ?? []).map((t) => ({ ...t, doDate: t.doDate ?? '', priority: (t.priority === 2 ? 0 : t.priority) as Priority }));
  }
  data.tasks = data.tasks.map((t) => ({ ...t, doDate: t.doDate ?? '' }));
  data.buckets = data.buckets.map((b) => {
    const i = OLD_COLORS.indexOf(b.color);
    return i >= 0 ? { ...b, color: COLORS[i] } : b;
  });
  data.version = 2;
  return data;
}


export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// YYYY-MM-DD for "today" (+offset), in the given IANA time zone or the local one.
export function todayStr(offsetDays = 0, tz?: string): string {
  if (tz) return isoInTz(new Date(Date.now() + offsetDays * 86400000), tz);
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isoInTz(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// ---------- Sync diffs ----------
// A change set between two plans, per collection: upserts (whole records) and deleted ids.
export type Coll = 'buckets' | 'goals' | 'milestones' | 'tasks';
export const COLLS: Coll[] = ['buckets', 'goals', 'milestones', 'tasks'];

export interface ChangeSet {
  upsert: Partial<{ buckets: Bucket[]; goals: Goal[]; milestones: Milestone[]; tasks: Task[] }>;
  delete: Partial<Record<Coll, string[]>>;
  prefs?: Prefs;
}

export function diffPlans(from: PlanData, to: PlanData): ChangeSet {
  const cs: ChangeSet = { upsert: {}, delete: {} };
  for (const c of COLLS) {
    const before = new Map((from[c] as { id: string }[]).map((x) => [x.id, JSON.stringify(x)]));
    const afterIds = new Set<string>();
    const ups: unknown[] = [];
    for (const x of to[c] as { id: string }[]) {
      afterIds.add(x.id);
      if (before.get(x.id) !== JSON.stringify(x)) ups.push(x);
    }
    const dels = [...before.keys()].filter((id) => !afterIds.has(id));
    if (ups.length) (cs.upsert as Record<string, unknown[]>)[c] = ups;
    if (dels.length) cs.delete[c] = dels;
  }
  if (JSON.stringify(from.prefs) !== JSON.stringify(to.prefs)) cs.prefs = to.prefs;
  return cs;
}

export function isEmptyChange(cs: ChangeSet): boolean {
  return !cs.prefs && !Object.keys(cs.upsert).length && !Object.keys(cs.delete).length;
}

export function applyChanges(base: PlanData, cs: ChangeSet): PlanData {
  const next: PlanData = { ...base, prefs: cs.prefs ? { ...base.prefs, ...cs.prefs } : base.prefs };
  for (const c of COLLS) {
    const dels = new Set(cs.delete[c] ?? []);
    const ups = new Map(((cs.upsert[c] ?? []) as { id: string }[]).map((x) => [x.id, x]));
    const list = (base[c] as { id: string }[]).filter((x) => !dels.has(x.id)).map((x) => (ups.has(x.id) ? ups.get(x.id)! : x));
    for (const [id, x] of ups) if (!list.some((y) => y.id === id)) list.push(x);
    (next as unknown as Record<string, unknown>)[c] = list;
  }
  return next;
}
