import { useEffect, useRef, useState } from 'react';
import type { Settings } from '../lib/settings';
import { LOCAL_MODELS } from '../lib/settings';
import { streamChat, hasWebGPU, localModelLoaded, type ChatMessage } from '../lib/llm';
import type { GoogleData } from '../App';

interface Props {
  settings: Settings;
  data: GoogleData;
  signedIn: boolean;
  onConnect: () => void;
}

// Turns connected data into a compact block the model can read.
function buildContext(data: GoogleData, use: { inbox: boolean; calendar: boolean }): string {
  const parts: string[] = [];
  const now = new Date();
  parts.push(`Current date and time: ${now.toLocaleString()}.`);
  if (use.inbox && data.emails?.length) {
    parts.push(
      'Recent inbox emails:\n' +
        data.emails
          .slice(0, 20)
          .map((e) => `- ${e.unread ? '[unread] ' : ''}From ${e.from} | "${e.subject}" | ${e.date}\n  ${e.snippet}`)
          .join('\n'),
    );
  }
  if (use.calendar) {
    if (data.events?.length) {
      parts.push(
        'Calendar, next 7 days:\n' +
          data.events.map((e) => `- ${e.title} | ${e.allDay ? e.start + ' (all day)' : new Date(e.start).toLocaleString()}`).join('\n'),
      );
    }
    if (data.tasks?.length) {
      parts.push('Open Google Tasks:\n' + data.tasks.map((t) => `- ${t.title}${t.due ? ` (due ${t.due.slice(0, 10)})` : ''}`).join('\n'));
    }
  }
  return parts.join('\n\n');
}

const SYSTEM =
  "You are Jarvis, a personal productivity copilot. Be concise and practical. When the user's emails, calendar or tasks are provided, use them to answer and point out what needs attention and by when. Never invent emails or events that aren't listed.";

export function Chat({ settings, data, signedIn, onConnect }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ text: string; pct: number } | null>(null);
  const [error, setError] = useState('');
  const [useInbox, setUseInbox] = useState(true);
  const [useCal, setUseCal] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const modelLabel =
    settings.provider === 'local'
      ? LOCAL_MODELS.find((m) => m.id === settings.localModel)?.label ?? settings.localModel
      : settings.provider === 'anthropic'
        ? settings.anthropicModel
        : settings.openaiModel || 'OpenAI-compatible';

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setError('');
    const history: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const context = signedIn ? buildContext(data, { inbox: useInbox, calendar: useCal }) : `Current date and time: ${new Date().toLocaleString()}.`;
    const full: ChatMessage[] = [{ role: 'system', content: `${SYSTEM}\n\n${context}` }, ...history];
    try {
      await streamChat(
        settings,
        full,
        (tok) =>
          setMessages((m) => {
            const copy = m.slice();
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + tok };
            return copy;
          }),
        (p) => setProgress({ text: p.text, pct: Math.round(p.progress * 100) }),
        ctrl.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      setMessages((m) => (m[m.length - 1]?.content === '' ? m.slice(0, -1) : m));
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();
  const empty = messages.length === 0;
  const needsDownload = settings.provider === 'local' && !localModelLoaded(settings.localModel);

  return (
    <div className="chat">
      <header className="page-head">
        <h1>Chat</h1>
        <span className="pill">{settings.provider === 'local' ? '🖥️ On-device' : '☁️ Cloud'} · {modelLabel}</span>
        {!empty && (
          <button className="btn small ghost" onClick={() => setMessages([])} disabled={busy}>
            New chat
          </button>
        )}
      </header>

      <div className="messages">
        {empty && (
          <div className="empty">
            <h2>What do you need to get done?</h2>
            <p>
              {settings.provider === 'local'
                ? hasWebGPU()
                  ? needsDownload
                    ? 'The model runs on your device. Your first message downloads it once (cached after that).'
                    : 'Model loaded and running on your device.'
                  : 'This browser has no WebGPU, so on-device models won’t run. Pick a cloud model in Settings.'
                : 'Using a cloud model with your API key.'}
            </p>
            {!signedIn && (
              <button className="btn" onClick={onConnect}>
                Connect Google to use your inbox and calendar
              </button>
            )}
            {signedIn && (
              <div className="suggestions">
                {['What should I focus on today?', 'Which emails need a reply?', "What's coming up this week?"].map((s) => (
                  <button key={s} className="chip" onClick={() => setInput(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="bubble">{m.content || (busy && i === messages.length - 1 ? '…' : '')}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {progress && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress.pct}%` }} />
          <span>{progress.text}</span>
        </div>
      )}
      {error && <div className="banner error">{error}</div>}

      <div className="composer">
        {signedIn && (
          <div className="toggles">
            <label>
              <input type="checkbox" checked={useInbox} onChange={(e) => setUseInbox(e.target.checked)} /> Use inbox
            </label>
            <label>
              <input type="checkbox" checked={useCal} onChange={(e) => setUseCal(e.target.checked)} /> Use calendar & tasks
            </label>
          </div>
        )}
        <div className="input-row">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message Jarvis…"
            rows={1}
          />
          {busy ? (
            <button className="btn" onClick={stop}>
              Stop
            </button>
          ) : (
            <button className="btn" onClick={send} disabled={!input.trim()}>
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
