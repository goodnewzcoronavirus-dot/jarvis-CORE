import type { Settings, Provider } from '../lib/settings';
import { LOCAL_MODELS } from '../lib/settings';
import { hasWebGPU } from '../lib/llm';
import { exportPlan, importPlan } from '../lib/plan';
import { CloudSettings } from './CloudSettings';
import { useSync } from '../lib/sync';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
}

export function SettingsPage({ settings, onChange }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const origin = window.location.origin;
  const cloud = useSync();

  return (
    <div className="page settings">
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <CloudSettings />

      <section className="card">
        <h2>Model</h2>
        <div className="seg">
          {(
            [
              ['local', '🖥️ On-device'],
              ['anthropic', 'Claude (API key)'],
              ['openai', 'OpenAI-compatible'],
            ] as [Provider, string][]
          ).map(([id, label]) => (
            <button key={id} className={settings.provider === id ? 'on' : ''} onClick={() => set('provider', id)}>
              {label}
            </button>
          ))}
        </div>

        {settings.provider === 'local' && (
          <>
            {!hasWebGPU() && (
              <p className="warn">This browser has no WebGPU, so on-device models won’t run here. Use Chrome or Edge on a laptop.</p>
            )}
            <div className="model-list">
              {LOCAL_MODELS.map((m) => (
                <label key={m.id} className={`model ${settings.localModel === m.id ? 'on' : ''}`}>
                  <input
                    type="radio"
                    name="model"
                    checked={settings.localModel === m.id}
                    onChange={() => set('localModel', m.id)}
                  />
                  <span>
                    <strong>{m.label}</strong>
                    <span className="muted">{m.note}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="muted">Downloads once, then it’s cached in this browser. Runs fully on your device.</p>
          </>
        )}

        {settings.provider === 'anthropic' && (
          <>
            <label className="field">
              API key
              <input type="password" value={settings.anthropicKey} onChange={(e) => set('anthropicKey', e.target.value)} placeholder="sk-ant-…" />
            </label>
            <label className="field">
              Model
              <input value={settings.anthropicModel} onChange={(e) => set('anthropicModel', e.target.value)} />
            </label>
          </>
        )}

        {settings.provider === 'openai' && (
          <>
            <label className="field">
              Base URL
              <input value={settings.openaiBaseUrl} onChange={(e) => set('openaiBaseUrl', e.target.value)} />
            </label>
            <label className="field">
              API key
              <input type="password" value={settings.openaiKey} onChange={(e) => set('openaiKey', e.target.value)} />
            </label>
            <label className="field">
              Model
              <input value={settings.openaiModel} onChange={(e) => set('openaiModel', e.target.value)} placeholder="model name" />
            </label>
          </>
        )}
        {settings.provider !== 'local' && (
          <p className="muted">Your key is stored only in this browser. Don’t use this on a shared computer.</p>
        )}
      </section>

      <section className="card">
        <h2>Google connector</h2>
        <label className="field">
          OAuth Client ID
          <input
            value={settings.googleClientId}
            onChange={(e) => set('googleClientId', e.target.value.trim())}
            placeholder="1234-abc.apps.googleusercontent.com"
          />
        </label>
        <details>
          <summary>How to get one (about 10 minutes, once)</summary>
          <ol>
            <li>
              Go to <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud</a> and create a project called “Jarvis”.
            </li>
            <li>
              Enable the <strong>Gmail API</strong>, <strong>Google Calendar API</strong> and <strong>Google Tasks API</strong> (APIs &amp; Services → Library).
            </li>
            <li>
              OAuth consent screen: choose <strong>External</strong>, fill in the app name and your email, and add yourself under <strong>Test users</strong>.
            </li>
            <li>
              Credentials → Create credentials → <strong>OAuth client ID</strong> → type <strong>Web application</strong>.
            </li>
            <li>
              Under <strong>Authorized JavaScript origins</strong> add <code>{origin}</code>. Leave redirect URIs empty.
            </li>
            <li>Copy the Client ID and paste it above.</li>
          </ol>
        </details>
      </section>

      <section className="card">
        <h2>Backup</h2>
        <p className="muted">
          {cloud.connected
            ? 'Your plan is stored on your Jarvis Cloud server and cached in this browser. A backup file is still a good idea now and then.'
            : 'Your buckets, goals and tasks are saved in this browser only. Download a backup now and then, and use Import to move them to another device or browser.'}
        </p>
        <div className="row-actions">
          <button
            className="btn small"
            onClick={() => {
              const blob = new Blob([exportPlan()], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `jarvis-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Download backup
          </button>
          <label className="btn small ghost file-btn">
            Import backup
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (!confirm('Replace everything in this browser with the backup?')) return;
                try {
                  importPlan(await f.text());
                  alert('Backup imported.');
                } catch (err) {
                  alert((err as Error).message);
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Privacy</h2>
        <p className="muted">
          {cloud.connected
            ? 'Your plan lives on your own Cloudflare Worker, protected by your token; Claude reaches it only through the connector URL. Settings and API keys stay in this browser. Google sign-in lasts about an hour and is kept in memory.'
            : 'There’s no server. Settings live in this browser, your Google sign-in lasts about an hour and is kept only in memory, and email and calendar data is fetched directly from Google into this tab.'}
        </p>
      </section>
    </div>
  );
}
