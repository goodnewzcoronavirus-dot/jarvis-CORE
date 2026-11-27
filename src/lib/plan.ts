// The planning model: Buckets > Goals > Milestones > Tasks.
// A task can hang off a milestone, a goal, or sit directly in a bucket.
// Everything is stored in this browser's localStorage. Use Settings → Backup
// to export/import a JSON copy.
import { useSyncExternalStore } from 'react';
import { COLORS, EMPTY, migrate, uid, todayStr, type Bucket, type Goal, type Milestone, type PlanData, type Prefs, type Task } from './core';

export * from './core';

const KEY = 'jarvis-plan';
function load(): PlanData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    /* fall through */
  }
  return EMPTY;
}

let state: PlanData = load();
const listeners = new Set<() => void>();

const localCommitListeners = new Set<(prev: PlanData, next: PlanData) => void>();

function store(next: PlanData) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked; keep in memory */
  }
  listeners.forEach((l) => l());
}

// A change made in this app. Jarvis Cloud sync listens to push it.
function commit(next: PlanData) {
  const prev = state;
  store(next);
  localCommitListeners.forEach((l) => l(prev, next));
}

export function onLocalCommit(fn: (prev: PlanData, next: PlanData) => void): () => void {
  localCommitListeners.add(fn);
  return () => localCommitListeners.delete(fn);
}

// A change that came from Jarvis Cloud (Claude or another device). Not pushed back.
export function replaceFromRemote(next: PlanData) {
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  store(next);
}

// Keep tabs in sync if the app is open in two windows.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      state = load();
      listeners.forEach((l) => l());
    }
  });
}

export function usePlan(): PlanData {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}


// ---------- Buckets ----------
export function addBucket(name: string): string {
  const id = uid();
  const color = COLORS[state.buckets.length % COLORS.length];
  commit({ ...state, buckets: [...state.buckets, { id, name, color, createdAt: Date.now() }] });
  return id;
}

export function updateBucket(id: string, patch: Partial<Bucket>) {
  commit({ ...state, buckets: state.buckets.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
}

export function deleteBucket(id: string) {
  const goalIds = new Set(state.goals.filter((g) => g.bucketId === id).map((g) => g.id));
  commit({
    ...state,
    buckets: state.buckets.filter((b) => b.id !== id),
    goals: state.goals.filter((g) => g.bucketId !== id),
    milestones: state.milestones.filter((m) => !goalIds.has(m.goalId)),
    tasks: state.tasks.filter((t) => t.bucketId !== id),
  });
}

// ---------- Goals ----------
export function addGoal(bucketId: string, title: string, targetDate = ''): string {
  const id = uid();
  commit({ ...state, goals: [...state.goals, { id, bucketId, title, why: '', targetDate, done: false, createdAt: Date.now() }] });
  return id;
}

export function updateGoal(id: string, patch: Partial<Goal>) {
  commit({ ...state, goals: state.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
}

export function deleteGoal(id: string) {
  const msIds = new Set(state.milestones.filter((m) => m.goalId === id).map((m) => m.id));
  commit({
    ...state,
    goals: state.goals.filter((g) => g.id !== id),
    milestones: state.milestones.filter((m) => m.goalId !== id),
    tasks: state.tasks.filter((t) => t.goalId !== id && !msIds.has(t.milestoneId)),
  });
}

// ---------- Milestones ----------
export function addMilestone(goalId: string, title: string, dueDate = ''): string {
  const id = uid();
  commit({ ...state, milestones: [...state.milestones, { id, goalId, title, dueDate, done: false, createdAt: Date.now() }] });
  return id;
}

export function updateMilestone(id: string, patch: Partial<Milestone>) {
  commit({ ...state, milestones: state.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
}

export function deleteMilestone(id: string) {
  commit({
    ...state,
    milestones: state.milestones.filter((m) => m.id !== id),
    tasks: state.tasks.filter((t) => t.milestoneId !== id),
  });
}

// ---------- Tasks ----------
export function addTask(t: Partial<Task> & { bucketId: string; title: string }): string {
  const id = uid();
  const task: Task = {
    id,
    goalId: '',
    milestoneId: '',
    due: '',
    doDate: '',
    priority: 0,
    notes: '',
    done: false,
    doneAt: 0,
    createdAt: Date.now(),
    ...t,
  };
  // A task under a milestone always belongs to that milestone's goal.
  if (task.milestoneId && !task.goalId) {
    task.goalId = state.milestones.find((m) => m.id === task.milestoneId)?.goalId ?? '';
  }
  commit({ ...state, tasks: [...state.tasks, task] });
  return id;
}

export function updateTask(id: string, patch: Partial<Task>) {
  commit({
    ...state,
    tasks: state.tasks.map((t) => {
      if (t.id !== id) return t;
      const next = { ...t, ...patch };
      if (patch.done !== undefined) next.doneAt = patch.done ? Date.now() : 0;
      return next;
    }),
  });
}

export function deleteTask(id: string) {
  commit({ ...state, tasks: state.tasks.filter((t) => t.id !== id) });
}

// ---------- Backup ----------
export function exportPlan(): string {
  return JSON.stringify(state, null, 2);
}

export function importPlan(json: string) {
  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.buckets) || !Array.isArray(data.tasks)) {
    throw new Error("That file doesn't look like a Jarvis backup.");
  }
  commit(migrate(data));
}

export function setPrefs(patch: Partial<Prefs>) {
  commit({ ...state, prefs: { ...state.prefs, ...patch } });
}

// Direct access for non-React code (the Claude bridge).
export function getPlan(): PlanData {
  return state;
}

export function commitPlan(next: PlanData) {
  commit(next);
}


// ---------- Date helpers ----------
export function prettyDate(s: string): string {
  if (!s) return '';
  if (s === todayStr()) return 'Today';
  if (s === todayStr(1)) return 'Tomorrow';
  if (s === todayStr(-1)) return 'Yesterday';
  const d = new Date(s + 'T00:00');
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function progress(tasks: Task[]): { done: number; total: number; pct: number } {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}
