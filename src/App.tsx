import { useCallback, useState } from 'react';
import { loadSettings, saveSettings, type Settings } from './lib/settings';
import * as google from './lib/google';
import type { Email, CalEvent, GTask } from './lib/google';
import { Chat } from './components/Chat';
import { Inbox } from './components/Inbox';
import { Calendar } from './components/Calendar';
import { SettingsPage } from './components/SettingsPage';
import { Today } from './components/plan/Today';
import { Buckets } from './components/plan/Buckets';
import { Bridge } from './components/plan/Bridge';

export type Page = 'today' | 'buckets' | 'chat' | 'inbox' | 'calendar' | 'settings';

export interface GoogleData {
  emails: Email[] | null;
  events: CalEvent[] | null;
  tasks: GTask[] | null;
}

// Hand-drawn 20px line icons, one stroke weight.
const ICONS: Record<Page | 'claude', React.ReactNode> = {
  today: <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.1 5.1l1.4 1.4M13.5 13.5l1.4 1.4M5.1 14.9l1.4-1.4M13.5 6.5l1.4-1.4M10 7.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z" />,
  buckets: <path d="M3 5.5h14M3 10h14M3 14.5h14M5.5 3v14" />,
  chat: <path d="M4 5h12v8H9l-3.5 2.5V13H4z" />,
  inbox: <path d="M3 6h14v9H3zM3 6l7 5 7-5" />,
  calendar: <path d="M3.5 5h13v11h-13zM3.5 8.5h13M7 3v3.5M13 3v3.5" />,
  settings: <path d="M10 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />,
  claude: <path d="M10 3l1.6 5.4L17 10l-5.4 1.6L10 17l-1.6-5.4L3 10l5.4-1.6z" />,
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

const NAV: { section: string; items: { id: Page; label: string }[] }[] = [
  { section: 'Plan', items: [{ id: 'today', label: 'Today' }, { id: 'buckets', label: 'Buckets' }] },
  { section: 'Assist', items: [{ id: 'chat', label: 'Chat' }, { id: 'inbox', label: 'Inbox' }, { id: 'calendar', label: 'Calendar' }] },
];

export default function App() {
  const [page, setPage] = useState<Page>('today');
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<GoogleData>({ emails: null, events: null, tasks: null });
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [openBucket, setOpenBucket] = useState('');
  const [bridge, setBridge] = useState<null | { text: string; mode: 'think' | 'claude' }>(null);

  const setSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  };

  const sync = useCallback(async () => {
    setSyncing(true);
    setError('');
    try {
      const [emails, events, tasks] = await Promise.all([google.fetchInbox(), google.fetchCalendar(), google.fetchTasks().catch(() => [] as GTask[])]);
      setData({ emails, events, tasks });
    } catch (e) {
      setError((e as Error).message);
      if (!google.isSignedIn()) setSignedIn(false);
    } finally {
      setSyncing(false);
    }
  }, []);

  const connect = async () => {
    setError('');
    try {
      await google.signIn(settings.googleClientId);
      setSignedIn(true);
      await sync();
    } catch (e) {
      setError((e as Error).message);
      if (!settings.googleClientId) setPage('settings');
    }
  };

  const disconnect = () => {
    google.signOut();
    setSignedIn(false);
    setData({ emails: null, events: null, tasks: null });
  };

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Jarvis</span>
        </div>
        <nav>
          {NAV.map((g) => (
            <div key={g.section} className="nav-group">
              <div className="nav-section">{g.section}</div>
              {g.items.map((n) => (
                <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
                  <Icon name={n.id} />
                  <span>{n.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="rail-foot">
          <button className="nav-item claude" onClick={() => setBridge({ text: '', mode: 'claude' })}>
            <Icon name="claude" />
            <span>Sync with Claude</span>
          </button>
          <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}>
            <Icon name="settings" />
            <span>Settings</span>
          </button>
          <div className="google-status">
            <span className={`dot ${signedIn ? 'on' : ''}`} />
            {signedIn ? (
              <>
                <span>Google</span>
                <button className="link small" onClick={sync} disabled={syncing}>
                  {syncing ? 'syncing' : 'sync'}
                </button>
                <button className="link small" onClick={disconnect}>
                  off
                </button>
              </>
            ) : (
              <button className="link small" onClick={connect}>
                Connect Google
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="main">
        {error && (
          <div className="banner error">
            {error}
            <button className="banner-x" onClick={() => setError('')} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        {page === 'today' && (
          <Today
            onOpenBuckets={() => setPage('buckets')}
            onOpenBucket={(id) => {
              setOpenBucket(id);
              setPage('buckets');
            }}
            onThink={(text, mode) => setBridge({ text, mode })}
          />
        )}
        {page === 'buckets' && <Buckets settings={settings} openId={openBucket} onOpened={() => setOpenBucket('')} />}
        {page === 'chat' && <Chat settings={settings} data={data} signedIn={signedIn} onConnect={connect} />}
        {page === 'inbox' && <Inbox emails={data.emails} signedIn={signedIn} onConnect={connect} />}
        {page === 'calendar' && <Calendar events={data.events} tasks={data.tasks} signedIn={signedIn} onConnect={connect} />}
        {page === 'settings' && <SettingsPage settings={settings} onChange={setSettings} />}
      </main>

      <nav className="tabbar" aria-label="Main">
        {(['today', 'buckets', 'chat', 'inbox', 'settings'] as Page[]).map((id) => (
          <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>
            <Icon name={id} />
            <span>{id === 'today' ? 'Today' : id[0].toUpperCase() + id.slice(1)}</span>
          </button>
        ))}
        <button onClick={() => setBridge({ text: '', mode: 'claude' })}>
          <Icon name="claude" />
          <span>Claude</span>
        </button>
      </nav>

      {bridge && <Bridge settings={settings} initialText={bridge.text} initialMode={bridge.mode} onClose={() => setBridge(null)} />}
    </div>
  );
}
