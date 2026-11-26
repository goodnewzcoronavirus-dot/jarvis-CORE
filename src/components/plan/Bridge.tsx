import { useEffect, useMemo, useState } from 'react';
import { applyResolved, buildPrompt, canRunInApp, extractPatch, resolvePatch, runInApp, type Change } from '../../lib/bridge';
import type { Settings } from '../../lib/settings';

type Mode = 'think' | 'claude';

const KIND_LABEL: Record<Change['kind'], string> = {
  'add-bucket': 'NEW BUCKET',
  'add-goal': 'NEW GOAL',
  'add-milestone': 'MILESTONE',
  'add-task': 'TASK',
  update: 'UPDATE',
  complete: 'DONE',
  delete: 'DELETE',
};

export function Bridge({
  settings,
  initialText,
  initialMode,
  onClose,
}: {
  settings: Settings;
  initialText: string;
  initialMode: Mode;
  onClose: () => void;
}) {
  const inApp = canRunInApp(settings);
  const [mode, setMode] = useState<Mode>(initialMode === 'think' && !inApp ? 'claude' : initialMode);
  const [request, setRequest] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState('');
  const [running, setRunning] = useState(false);
  const [streamed, setStreamed] = useState('');
  const [error, setError] = useState('');
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const source = mode === 'claude' ? reply : streamed;
  const resolved = useMemo(() => {
    if (!source.trim() || running) return null;
    try {
      return { ok: true as const, r: resolvePatch(extractPatch(source)) };
    } catch (e) {
      return { ok: false as const, msg: (e as Error).message };
    }
  }, [source, running]);

  const advice = useMemo(() => source.replace(/```jarvis[\s\S]*?(```|$)/g, '').trim(), [source]);

  const copy = async () => {
    const prompt = buildPrompt(request);
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
  };

  const think = async () => {
    setError('');
    setStreamed('');
    setRunning(true);
    try {
      await runInApp(settings, request, setStreamed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const apply = () => {
    if (!resolved?.ok) return;
    const n = resolved.r.changes.filter((c) => !skip.has(c.key)).length;
    applyResolved(resolved.r, skip);
    setApplied(n);
  };

  const toggle = (k: string) =>
    setSkip((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Plan with AI">
        <div className="modal-head">
          <div className="seg">
            <button className={mode === 'think' ? 'on' : ''} onClick={() => setMode('think')}>
              Jarvis · Haiku
            </button>
            <button className={mode === 'claude' ? 'on' : ''} onClick={() => setMode('claude')}>
              Claude chat
            </button>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {applied > 0 ? (
          <div className="modal-done">
            <div className="big-num">{applied}</div>
            <p>changes applied. Jarvis has rescheduled everything around them.</p>
            <button className="btn" onClick={onClose}>
              Back to plan
            </button>
          </div>
        ) : (
          <>
            <label className="field">
              <span className="label">What’s on your mind</span>
              <textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                rows={3}
                placeholder="e.g. I need to get into a summer research program. Figure out deadlines and what I should do this week."
              />
            </label>

            {mode === 'think' && (
              <>
                {!inApp ? (
                  <p className="muted">
                    Add your Anthropic API key in Settings to run this inside Jarvis with Claude Haiku (about a tenth of a cent per run). Or use the Claude
                    chat tab, which runs on your subscription.
                  </p>
                ) : (
                  <div className="row-actions">
                    <button className="btn" onClick={think} disabled={running}>
                      {running ? 'Thinking…' : 'Plan it'}
                    </button>
                    <span className="muted mono">{settings.provider === 'anthropic' ? settings.anthropicModel : settings.openaiModel}</span>
                  </div>
                )}
              </>
            )}

            {mode === 'claude' && (
              <ol className="steps">
                <li>
                  <div className="row-actions">
                    <button className="btn" onClick={copy}>
                      {copied ? 'Copied ✓' : 'Copy for Claude'}
                    </button>
                    <a className="link" href="https://claude.ai/new" target="_blank" rel="noreferrer">
                      Open Claude ↗
                    </a>
                  </div>
                  <span className="muted">This copies your request plus your whole plan. Paste it into a Claude chat. It can research and use your connected apps.</span>
                </li>
                <li>
                  <span className="muted">Paste Claude’s full reply here:</span>
                  <textarea
                    className="mono-area"
                    value={reply}
                    onChange={(e) => {
                      setReply(e.target.value);
                      setSkip(new Set());
                    }}
                    rows={4}
                    placeholder="…Claude’s reply ending in a ```jarvis block"
                  />
                </li>
              </ol>
            )}

            {error && <p className="danger">{error}</p>}
            {running && streamed && <pre className="stream">{advice || 'Planning…'}</pre>}

            {resolved && !resolved.ok && <p className="danger">{resolved.msg}</p>}
            {resolved?.ok && (
              <div className="preview">
                {advice && <p className="advice">{advice}</p>}
                {resolved.r.changes.length === 0 ? (
                  <p className="muted">No changes in that reply.</p>
                ) : (
                  <>
                    <div className="label">Proposed changes · uncheck to skip</div>
                    <ul className="change-list">
                      {resolved.r.changes.map((c) => (
                        <li key={c.key} className={`change k-${c.kind} ${skip.has(c.key) ? 'off' : ''}`}>
                          <label>
                            <input type="checkbox" checked={!skip.has(c.key)} onChange={() => toggle(c.key)} />
                            <span className="change-kind">{KIND_LABEL[c.kind]}</span>
                            <span className="change-label">{c.label}</span>
                          </label>
                          <span className="change-detail">{c.detail}</span>
                        </li>
                      ))}
                    </ul>
                    <button className="btn" onClick={apply}>
                      Apply {resolved.r.changes.filter((c) => !skip.has(c.key)).length} changes
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
