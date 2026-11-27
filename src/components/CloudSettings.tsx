import { useState } from 'react';
import { connect, disconnect, getConfig, probe, useSync, type ProbeResult } from '../lib/sync';

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

export function CloudSettings() {
  const sync = useSync();
  const cfg = getConfig();
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [token, setToken] = useState(cfg?.token ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [found, setFound] = useState<ProbeResult | null>(null);
  const [copied, setCopied] = useState('');

  const doCopy = async (what: string, text: string) => {
    await copy(text);
    setCopied(what);
    setTimeout(() => setCopied(''), 1500);
  };

  const check = async () => {
    setErr('');
    setBusy(true);
    try {
      const r = await probe(url, token);
      if (r.remoteTasks === 0 && r.remoteBuckets === 0) {
        await connect(url, token, 'upload');
        setFound(null);
      } else if (r.localTasks === 0) {
        await connect(url, token, 'download');
        setFound(null);
      } else setFound(r);
    } catch (e) {
      setErr((e as Error).message === 'Failed to fetch' ? 'Can’t reach that URL. Check it and that the Worker is deployed.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async (mode: 'upload' | 'download') => {
    setBusy(true);
    try {
      await connect(url, token, mode);
      setFound(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const connectorUrl = cfg ? `${cfg.url}/mcp/${cfg.token}` : '';

  return (
    <section className="card">
      <h2>Jarvis Cloud · Claude connector</h2>
      {sync.connected ? (
        <>
          <p className="cloud-status">
            <span className={`sync-dot s-${sync.status}`} />
            {sync.status === 'ok' ? 'Connected and syncing' : sync.status === 'syncing' ? 'Syncing…' : sync.status === 'offline' ? 'Offline, will sync when back' : `Problem: ${sync.lastError}`}
          </p>
          <label className="field">
            Connector URL for Claude
            <span className="copy-row">
              <input readOnly value={connectorUrl} type="password" onFocus={(e) => (e.target.type = 'text')} onBlur={(e) => (e.target.type = 'password')} />
              <button className="btn small" onClick={() => doCopy('mcp', connectorUrl)}>
                {copied === 'mcp' ? 'Copied' : 'Copy'}
              </button>
            </span>
          </label>
          <ol className="steps-list">
            <li>
              In Claude, open <strong>Settings → Connectors → Add custom connector</strong>.
            </li>
            <li>
              Name it <strong>Jarvis</strong> and paste the URL above. Leave the OAuth fields empty.
            </li>
            <li>In any chat, turn Jarvis on from the tools menu and ask things like “find my Elaina Morris task, draft the email in Gmail, and update the task”.</li>
          </ol>
          <p className="muted">This URL contains your secret token. Anyone with it can read and change your plan, so don't share it.</p>
          <button
            className="link danger"
            onClick={() => {
              if (confirm('Stop syncing this browser? Your plan stays on the server and in this browser.')) disconnect();
            }}
          >
            Disconnect this browser
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            Keeps your plan on your own small server (a free Cloudflare Worker) so Claude can read and change it through a connector, and every device stays in sync. Setup
            guide: README → “Jarvis Cloud”.
          </p>
          <label className="field">
            Worker URL
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://jarvis-cloud.yourname.workers.dev" />
          </label>
          <label className="field">
            Token (the JARVIS_TOKEN secret you set in Cloudflare)
            <span className="copy-row">
              <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="paste it, or generate one first" />
              <button
                className="btn small ghost"
                onClick={() => {
                  const t = randomToken();
                  setToken(t);
                  doCopy('tok', t);
                }}
              >
                {copied === 'tok' ? 'Copied' : 'Generate'}
              </button>
            </span>
          </label>
          {!found && (
            <div className="row-actions">
              <button className="btn" onClick={check} disabled={busy || !url.trim() || token.trim().length < 24}>
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          )}
          {found && (
            <div className="choose">
              <p>
                The server already has a plan with <strong>{found.remoteTasks}</strong> tasks, and this browser has <strong>{found.localTasks}</strong>. Which one should win?
              </p>
              <div className="row-actions">
                <button className="btn" onClick={() => finish('download')} disabled={busy}>
                  Use the server’s plan
                </button>
                <button className="btn ghost" onClick={() => confirm('Replace the server’s plan with this browser’s?') && finish('upload')} disabled={busy}>
                  Replace it with this browser’s
                </button>
              </div>
            </div>
          )}
          {err && <p className="danger">{err}</p>}
        </>
      )}
    </section>
  );
}
