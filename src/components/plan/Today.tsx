import { useMemo, useRef, useState } from 'react';
import { addTask, setPrefs, todayStr, usePlan } from '../../lib/plan';
import { addDays, useSchedule } from '../../lib/schedule';
import { shortDate, TaskRow } from './parts';
import { Telemetry } from './Telemetry';

export function Today({
  onOpenBuckets,
  onOpenBucket,
  onThink,
}: {
  onOpenBuckets: () => void;
  onOpenBucket: (id: string) => void;
  onThink: (text: string, mode: 'think' | 'claude') => void;
}) {
  const plan = usePlan();
  const schedule = useSchedule(plan);
  const today = todayStr();
  const [text, setText] = useState('');
  const [bucketId, setBucketId] = useState('');
  const [goalId, setGoalId] = useState('');
  const [day, setDay] = useState(addDays(today, 1));
  const [showDone, setShowDone] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const bucket = bucketId || plan.buckets[0]?.id || '';
  const goalsInBucket = plan.goals.filter((g) => g.bucketId === bucket && !g.done);

  const doneToday = useMemo(
    () => plan.tasks.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toDateString() === new Date().toDateString()),
    [plan.tasks],
  );
  const run = schedule.byDay.get(today) ?? [];
  const totalToday = run.length + doneToday.length;
  const pctToday = totalToday ? Math.round((doneToday.length / totalToday) * 100) : 0;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));
  const maxLoad = Math.max(plan.prefs.dailyCapacity, ...week.map((d) => schedule.byDay.get(d)?.length ?? 0));
  const later = [...schedule.byDay.entries()].filter(([d]) => d > week[6]).reduce((n, [, l]) => n + l.length, 0);

  const add = () => {
    const lines = text
      .split('\n')
      .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean);
    if (!lines.length || !bucket) return;
    lines.forEach((title) => addTask({ bucketId: bucket, goalId: goalsInBucket.some((g) => g.id === goalId) ? goalId : '', title }));
    setText('');
    inputRef.current?.focus();
  };

  if (plan.buckets.length === 0) {
    return (
      <div className="page today">
        <div className="empty">
          <span className="label">Jarvis</span>
          <h2>Set up your buckets</h2>
          <p>Buckets are the big areas of your life. Goals and tasks live inside them, and Jarvis schedules the rest.</p>
          <button className="btn" onClick={onOpenBuckets}>
            Create buckets
          </button>
        </div>
      </div>
    );
  }

  const dateLabel = new Date();
  return (
    <div className="page today">
      <div className="today-grid">
        <div className="today-main">
          <header className="today-head">
            <div>
              <span className="label">{dateLabel.toLocaleDateString(undefined, { weekday: 'long' })}</span>
              <h1 className="display">{dateLabel.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</h1>
            </div>
            <div className="run-gauge" title="Today's tasks done">
              <svg viewBox="0 0 44 44" aria-hidden="true">
                <circle cx="22" cy="22" r="19" className="gauge-bg" />
                <circle cx="22" cy="22" r="19" className="gauge-fill" strokeDasharray={`${(pctToday / 100) * 119.4} 119.4`} />
              </svg>
              <div>
                <div className="gauge-num">
                  {doneToday.length}
                  <small>/{totalToday}</small>
                </div>
                <span className="label">today’s run</span>
              </div>
            </div>
          </header>

          <div className="command">
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="Add a task, or tell Jarvis what’s on your mind…"
              aria-label="Command"
            />
            <div className="command-bar">
              <select value={bucket} onChange={(e) => { setBucketId(e.target.value); setGoalId(''); }} aria-label="Bucket">
                {plan.buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select value={goalId} onChange={(e) => setGoalId(e.target.value)} aria-label="Goal">
                <option value="">No goal</option>
                {goalsInBucket.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
              <span className="spacer" />
              <button className="btn ghost" onClick={() => onThink(text, 'think')} title="Let AI turn this into a plan">
                ✦ Plan with AI
              </button>
              <button className="btn" onClick={add} disabled={!text.trim()}>
                Add
              </button>
            </div>
          </div>

          <section className="run">
            <div className="section-head">
              <span className="label">Today’s run</span>
              <span className="mono muted">
                {run.length} open · {plan.prefs.dailyCapacity}/day
              </span>
            </div>
            {run.length === 0 && <p className="muted quiet">Nothing scheduled today. Add a task above, or pull one forward from the week.</p>}
            <div className="task-list">
              {run.map((t) => (
                <TaskRow key={t.id} task={t} planned={schedule.tasks.get(t.id)} showContext showDay={false} />
              ))}
            </div>
            {doneToday.length > 0 && (
              <>
                <button className="link small" onClick={() => setShowDone(!showDone)}>
                  {showDone ? '▾' : '▸'} {doneToday.length} done today
                </button>
                {showDone && (
                  <div className="task-list">
                    {doneToday.map((t) => (
                      <TaskRow key={t.id} task={t} showContext showDay={false} />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="week">
            <div className="section-head">
              <span className="label">Next 7 days</span>
              <span className="mono muted">{later > 0 ? `+${later} later` : ''}</span>
            </div>
            <div className="week-strip" role="tablist">
              {week.map((d) => {
                const n = schedule.byDay.get(d)?.length ?? 0;
                const hasLate = (schedule.byDay.get(d) ?? []).some((t) => schedule.tasks.get(t.id)?.late);
                return (
                  <button key={d} role="tab" aria-selected={day === d} className={`week-day ${day === d ? 'on' : ''}`} onClick={() => setDay(d)}>
                    <span className="wd">{new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short' })}</span>
                    <span className="dn">{new Date(d + 'T00:00').getDate()}</span>
                    <span className="load">
                      <span className={hasLate ? 'late' : ''} style={{ height: `${(n / maxLoad) * 100}%` }} />
                    </span>
                    <span className="cnt mono">{n || '·'}</span>
                  </button>
                );
              })}
            </div>
            <div className="task-list">
              {(schedule.byDay.get(day) ?? []).map((t) => (
                <TaskRow key={t.id} task={t} planned={schedule.tasks.get(t.id)} showContext showDay={false} />
              ))}
              {(schedule.byDay.get(day) ?? []).length === 0 && <p className="muted quiet">Free day ({shortDate(day)}).</p>}
            </div>
            <div className="capacity mono">
              <span>Tasks per day</span>
              <button className="icon-btn" onClick={() => setPrefs({ dailyCapacity: Math.max(1, plan.prefs.dailyCapacity - 1) })} aria-label="Fewer per day">
                −
              </button>
              <strong>{plan.prefs.dailyCapacity}</strong>
              <button className="icon-btn" onClick={() => setPrefs({ dailyCapacity: Math.min(15, plan.prefs.dailyCapacity + 1) })} aria-label="More per day">
                +
              </button>
            </div>
          </section>
        </div>

        <Telemetry schedule={schedule} onOpenBucket={onOpenBucket} />
      </div>
    </div>
  );
}
