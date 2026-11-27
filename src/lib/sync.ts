// Jarvis Cloud sync. When a server URL + token are set, the plan lives on the
// server (which Claude reaches through the MCP connector) and this browser
// keeps a cached copy:
//   - local edits are pushed as per-record changes, so they merge with edits
//     Claude or another device made in the meantime
//   - remote edits are pulled on load, on focus and every few seconds
import { useSyncExternalStore } from 'react';
import { applyChanges, diffPlans, isEmptyChange, migrate, type PlanData } from './core';
import { getPlan, onLocalCommit, replaceFromRemote, setPrefs } from './plan';

export type SyncStatus = 'off' | 'syncing' | 'ok' | 'offline' | 'error';

interface Config {
  url: string;
  token: string;
}

const CFG_KEY = 'jarvis-cloud';
const POLL_MS = 8000;

let cfg: Config | null = loadCfg();
let synced: PlanData | null = null; // last plan we know the server has
let version = -1;
let status: SyncStatus = cfg ? 'syncing' : 'off';
let lastError = '';
let pushing = false;
let pushQueued = false;
let pushTimer = 0;
let pollTimer = 0;
const listeners = new Set<() => void>();

function loadCfg(): Config | null {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    return c?.url && c?.token ? c : null;
  } catch {
    return null;
  }
}

function set(s: SyncStatus, err = '') {
  status = s;
  lastError = err;
  snapshot = { status, lastError, connected: !!cfg, url: cfg?.url ?? '' };
  listeners.forEach((l) => l());
}

let snapshot: { status: SyncStatus; lastError: string; connected: boolean; url: string } = { status, lastError, connected: !!cfg, url: cfg?.url ?? '' };
export function useSync() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  );
}

export function getConfig(): Config | null {
  return cfg;
}

async function call<T>(path: string, init?: RequestInit, c: Config | null = cfg): Promise<T> {
  if (!c) throw new Error('Jarvis Cloud is not connected.');
  const res = await fetch(c.url.replace(/\/+$/, '') + path, {
    ...init,
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 401 ? 'Wrong token.' : (body as { error?: string }).error || `Server error ${res.status}`);
  return body as T;
}

interface Snap {
  version: number;
  plan: PlanData;
}

// Take the server's plan, replaying any local edits it hasn't seen yet on top.
function accept(s: Snap) {
  const remote = migrate(s.plan);
  const pending = synced ? diffPlans(synced, getPlan()) : null;
  version = s.version;
  synced = remote;
  if (pending && !isEmptyChange(pending)) {
    replaceFromRemote(applyChanges(remote, pending));
    schedulePush();
  } else {
    replaceFromRemote(remote);
  }
}

export async function pull() {
  if (!cfg || pushing) return;
  try {
    const v = await call<{ version: number }>('/api/version');
    if (v.version !== version) accept(await call<Snap>('/api/plan'));
    set('ok');
  } catch (e) {
    set(navigator.onLine ? 'error' : 'offline', (e as Error).message);
  }
}

async function push() {
  if (!cfg || !synced) return;
  if (pushing) {
    pushQueued = true;
    return;
  }
  const changes = diffPlans(synced, getPlan());
  if (isEmptyChange(changes)) return;
  pushing = true;
  set('syncing');
  try {
    accept(await call<Snap>('/api/sync', { method: 'POST', body: JSON.stringify({ changes }) }));
    set('ok');
  } catch (e) {
    set(navigator.onLine ? 'error' : 'offline', (e as Error).message);
  } finally {
    pushing = false;
    if (pushQueued) {
      pushQueued = false;
      push();
    }
  }
}

function schedulePush() {
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(push, 350);
}

function startLoops() {
  window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => document.visibilityState === 'visible' && pull(), POLL_MS);
}

// ---------- connect / disconnect ----------
export interface ProbeResult {
  remoteTasks: number;
  remoteBuckets: number;
  remoteVersion: number;
  localTasks: number;
}

export async function probe(url: string, token: string): Promise<ProbeResult> {
  const c = { url: url.trim().replace(/\/+$/, ''), token: token.trim() };
  const s = await call<Snap>('/api/plan', undefined, c);
  const local = getPlan();
  return { remoteTasks: s.plan.tasks.length, remoteBuckets: s.plan.buckets.length, remoteVersion: s.version, localTasks: local.tasks.length };
}

// mode "upload": this browser's plan replaces the server's. "download": use the server's.
export async function connect(url: string, token: string, mode: 'upload' | 'download') {
  const c = { url: url.trim().replace(/\/+$/, ''), token: token.trim() };
  if (mode === 'upload') {
    const plan = { ...getPlan(), prefs: { ...getPlan().prefs, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } };
    const s = await call<Snap>('/api/replace', { method: 'POST', body: JSON.stringify({ plan }) }, c);
    cfg = c;
    accept(s);
  } else {
    const s = await call<Snap>('/api/plan', undefined, c);
    cfg = c;
    accept(s);
  }
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
  ensureTimezone();
  startLoops();
  set('ok');
}

export function disconnect() {
  cfg = null;
  synced = null;
  version = -1;
  window.clearInterval(pollTimer);
  try {
    localStorage.removeItem(CFG_KEY);
  } catch {
    /* ignore */
  }
  set('off');
}

// Tell the server our time zone so its "today" matches ours.
function ensureTimezone() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && getPlan().prefs.timezone !== tz) setPrefs({ timezone: tz });
}

// ---------- boot ----------
onLocalCommit(() => {
  if (cfg && synced) schedulePush();
});

if (typeof window !== 'undefined' && cfg) {
  (async () => {
    try {
      accept(await call<Snap>('/api/plan'));
      ensureTimezone();
      set('ok');
    } catch (e) {
      set(navigator.onLine ? 'error' : 'offline', (e as Error).message);
    }
    startLoops();
  })();
  window.addEventListener('focus', () => pull());
  window.addEventListener('online', () => {
    pull();
    push();
  });
}
