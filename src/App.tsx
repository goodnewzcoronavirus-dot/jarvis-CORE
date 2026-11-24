import { useCallback, useState } from 'react';
import { loadSettings, saveSettings, type Settings } from './lib/settings';
import * as google from './lib/google';
import type { Email, CalEvent, GTask } from './lib/google';
import { Chat } from './components/Chat';
import { Inbox } from './components/Inbox';
import { Calendar } from './components/Calendar';
import { SettingsPage } from './components/SettingsPage';

export type Page = 'chat' | 'inbox' | 'calendar' | 'settings';

export interface GoogleData {
  emails: Email[] | null;
  events: CalEvent[] | null;
  tasks: GTask[] | null;
}

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'inbox', label: 'Inbox', icon: '✉️' },
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function App() {
  const [page, setPage] = useState<Page>('chat');
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<GoogleData>({ emails: null, events: null, tasks: null });
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  const setSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  };

  const sync = useCallback(async () => {
    setSyncing(true);
    setError('');
    try {
      const [emails, events, tasks] = await Promise.all([
        google.fetchInbox(),
        google.fetchCalendar(),
        google.fetchTasks().catch(() => [] as GTask[]),
      ]);
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

  const go = (p: Page) => {
    setPage(p);
    setNavOpen(false);
  };

  return (
    <div className="app">
      <button className="nav-toggle" onClick={() => setNavOpen(!navOpen)} aria-label="Menu">
        ☰
      </button>
      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="brand">Jarvis</div>
        <nav>
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="connect-box">
          <div className="connect-title">Google</div>
          {signedIn ? (
            <>
              <div className="connect-status ok">Connected</div>
              <button className="btn small" onClick={sync} disabled={syncing}>
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
              <button className="btn small ghost" onClick={disconnect}>
                Disconnect
              </button>
            </>
          ) : (
            <button className="btn small" onClick={connect}>
              Connect Google
            </button>
          )}
        </div>
      </aside>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      <main className="main">
        {error && (
          <div className="banner error">
            {error}
            <button className="banner-x" onClick={() => setError('')}>
              ×
            </button>
          </div>
        )}
        {page === 'chat' && <Chat settings={settings} data={data} signedIn={signedIn} onConnect={connect} />}
        {page === 'inbox' && <Inbox emails={data.emails} signedIn={signedIn} onConnect={connect} />}
        {page === 'calendar' && (
          <Calendar events={data.events} tasks={data.tasks} signedIn={signedIn} onConnect={connect} />
        )}
        {page === 'settings' && <SettingsPage settings={settings} onChange={setSettings} />}
      </main>
    </div>
  );
}
