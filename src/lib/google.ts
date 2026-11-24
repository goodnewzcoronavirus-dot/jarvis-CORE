// Google connector: sign in with Google Identity Services (token flow) and
// call Gmail / Calendar / Tasks REST APIs straight from the browser.
// The access token lives only in memory and expires after about an hour.

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks.readonly',
].join(' ');

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }) => TokenClient;
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

let token = '';
let tokenExpiry = 0;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.appendChild(s);
  });
}

export function isSignedIn(): boolean {
  return !!token && Date.now() < tokenExpiry;
}

export async function signIn(clientId: string): Promise<void> {
  if (!clientId) throw new Error('Add your Google OAuth Client ID in Settings first.');
  await loadGis();
  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || 'Sign-in failed'));
        token = r.access_token;
        tokenExpiry = Date.now() + ((r.expires_in ?? 3600) - 60) * 1000;
        resolve();
      },
      error_callback: (e) => reject(new Error(e.message || e.type)),
    });
    client.requestAccessToken();
  });
}

export function signOut(): void {
  if (token && window.google) window.google.accounts.oauth2.revoke(token, () => {});
  token = '';
  tokenExpiry = 0;
}

async function api<T>(url: string): Promise<T> {
  if (!isSignedIn()) throw new Error('Signed out of Google. Sign in again.');
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export interface Email {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
}

export async function fetchInbox(max = 25): Promise<Email[]> {
  const list = await api<{ messages?: { id: string }[] }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent('in:inbox')}`,
  );
  const ids = (list.messages ?? []).map((m) => m.id);
  const msgs = await Promise.all(
    ids.map((id) =>
      api<{
        id: string;
        snippet: string;
        labelIds?: string[];
        payload: { headers: { name: string; value: string }[] };
      }>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      ),
    ),
  );
  return msgs.map((m) => {
    const h = (n: string) => m.payload.headers.find((x) => x.name === n)?.value ?? '';
    return {
      id: m.id,
      from: h('From'),
      subject: h('Subject') || '(no subject)',
      date: h('Date'),
      snippet: decodeEntities(m.snippet),
      unread: m.labelIds?.includes('UNREAD') ?? false,
    };
  });
}

export interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

export async function fetchCalendar(days = 7): Promise<CalEvent[]> {
  const now = new Date();
  const until = new Date(now.getTime() + days * 86400000);
  const data = await api<{
    items?: {
      id: string;
      summary?: string;
      location?: string;
      start: { dateTime?: string; date?: string };
      end: { dateTime?: string; date?: string };
    }[];
  }>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${now.toISOString()}&timeMax=${until.toISOString()}&maxResults=100`,
  );
  return (data.items ?? []).map((e) => ({
    id: e.id,
    title: e.summary ?? '(no title)',
    start: e.start.dateTime ?? e.start.date ?? '',
    end: e.end.dateTime ?? e.end.date ?? '',
    allDay: !e.start.dateTime,
    location: e.location,
  }));
}

export interface GTask {
  id: string;
  title: string;
  due?: string;
  list: string;
}

export async function fetchTasks(): Promise<GTask[]> {
  const lists = await api<{ items?: { id: string; title: string }[] }>(
    'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
  );
  const all = await Promise.all(
    (lists.items ?? []).map(async (l) => {
      const t = await api<{ items?: { id: string; title: string; due?: string; status: string }[] }>(
        `https://tasks.googleapis.com/tasks/v1/lists/${l.id}/tasks?showCompleted=false&maxResults=100`,
      );
      return (t.items ?? []).map((x) => ({ id: x.id, title: x.title, due: x.due, list: l.title }));
    }),
  );
  return all.flat();
}

function decodeEntities(s: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}
