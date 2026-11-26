import { useMemo, useRef, useState } from 'react';
import { addTask, todayStr, updateTask, usePlan, type Task } from '../../lib/plan';
import { addDays, useSchedule, type Schedule } from '../../lib/schedule';
import { shortDate } from './parts';
import { PlanCalendar, TaskSheet } from './PlanCalendar';

export function Today({
  onOpenBuckets,
  onOpenBucket,
  onOpenCalendar,
  onThink,
}: {
  onOpenBuckets: () => void;
  onOpenBucket: (id: string) => void;
  onOpenCalendar: () => void;
  onThink: (text: string, mode: 'think' | 'claude') => void;
}) {
  const plan = usePlan();
  const schedule = useSchedule(plan);
  const today = todayStr();
  const [text, setText] = useState('');
  const [bucketId, setBucketId] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [sheet, setSheet] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const bucket = bucketId || plan.buckets[0]?.id || '';
  const colorOf = (id: string) => plan.buckets.find((b) => b.id === id)?.color ?? '#9aa9ba';
  const nameOf = (id: string) => plan.buckets.find((b) => b.id === id)?.name ?? '';

  const doneToday = useMemo(
    () => plan.tasks.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toDateString() === new Date().toDateString()),
    [plan.tasks],
  );
  const run = schedule.byDay.get(today) ?? [];
  const [focus, ...next] = run;
  const total = run.length + doneToday.length;
  const tomorrow = schedule.byDay.get(addDays(today, 1))?.length ?? 0;

  const add = () => {
    const lines = text
      .split('\n')
      .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean);
    if (!lines.length || !bucket) return;
    lines.forEach((title) => addTask({ bucketId: bucket, title }));
    setText('');
    inputRef.current?.focus();
  };

  if (plan.buckets.length === 0) {
    return (
      <div className="page today">
        <div className="empty">
          <h2>Set up your buckets</h2>
          <p>Buckets are the big areas of your life. Goals and tasks live inside them, and Jarvis schedules the rest.</p>
          <button className="btn" onClick={onOpenBuckets}>
            Create buckets
          </button>
        </div>
      </div>
    );
  }

  const sheetTask = sheet ? plan.tasks.find((t) => t.id === sheet) : undefined;
  const focusPlan = focus ? schedule.tasks.get(focus.id) : undefined;

  return (
    <div className="page today">
      <div className="today-grid">
        <div className="today-main">
          <header className="today-head">
            <h1 className="display">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h1>
            <span className="today-count">
              {doneToday.length} of {total} done
            </span>
          </header>

          {focus ? (
            <section className="focus" style={{ '--c': colorOf(focus.bucketId) } as React.CSSProperties}>
              <span className="focus-kicker">Do this now</span>
              <button className="focus-title" onClick={() => setSheet(focus.id)}>
                {focus.title}
              </button>
              <span className="focus-meta">
                <span className="bucket-tag" style={{ '--c': colorOf(focus.bucketId) } as React.CSSProperties}>
                  {nameOf(focus.bucketId)}
                </span>
                {focusPlan?.deadline && <span className={focusPlan.late ? 'danger' : ''}>· due {shortDate(focusPlan.deadline).toLowerCase()}</span>}
              </span>
              <div className="focus-actions">
                <button className="btn" onClick={() => updateTask(focus.id, { done: true })}>
                  Done
                </button>
                <button className="btn ghost" onClick={() => updateTask(focus.id, { doDate: addDays(today, 1) })}>
                  Later
                </button>
              </div>
            </section>
          ) : (
            <section className="focus clear">
              <span className="focus-kicker">All clear</span>
              <p className="focus-title static">{doneToday.length ? 'You finished today’s list.' : 'Nothing planned for today.'}</p>
              <span className="focus-meta">Tomorrow: {tomorrow || 'no'} task{tomorrow === 1 ? '' : 's'}</span>
            </section>
          )}

          {next.length > 0 && (
            <section className="next">
              <h2 className="h-small">Up next today</h2>
              {next.map((t) => (
                <SimpleRow key={t.id} task={t} schedule={schedule} color={colorOf(t.bucketId)} bucket={nameOf(t.bucketId)} onOpen={() => setSheet(t.id)} />
              ))}
            </section>
          )}
          {doneToday.length > 0 && (
            <>
              <button className="link small" onClick={() => setShowDone(!showDone)}>
                {showDone ? 'Hide' : 'Show'} {doneToday.length} done
              </button>
              {showDone &&
                doneToday.map((t) => <SimpleRow key={t.id} task={t} schedule={schedule} color={colorOf(t.bucketId)} bucket={nameOf(t.bucketId)} onOpen={() => setSheet(t.id)} />)}
            </>
          )}

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
              placeholder="Add a task…"
              aria-label="Add a task"
            />
            <div className="command-bar">
              <select value={bucket} onChange={(e) => setBucketId(e.target.value)} aria-label="Bucket">
                {plan.buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <span className="spacer" />
              <button className="btn ghost" onClick={() => onThink(text, 'think')}>
                ✦ Plan with AI
              </button>
              <button className="btn" onClick={add} disabled={!text.trim()}>
                Add
              </button>
            </div>
          </div>

          <section className="week-cal">
            <div className="h-row">
              <h2 className="h-small">This week</h2>
              <button className="link small" onClick={onOpenCalendar}>
                Full calendar →
              </button>
            </div>
            <PlanCalendar schedule={schedule} compact onOpenBucket={onOpenBucket} />
          </section>
        </div>

        <GoalBars schedule={schedule} onOpenBucket={onOpenBucket} />
      </div>

      {sheetTask && (
        <TaskSheet
          task={sheetTask}
          planned={schedule.tasks.get(sheetTask.id)?.date ?? ''}
          deadline={schedule.tasks.get(sheetTask.id)?.deadline ?? ''}
          onClose={() => setSheet('')}
          onOpenBucket={onOpenBucket}
        />
      )}
    </div>
  );
}

function SimpleRow({ task, schedule, color, bucket, onOpen }: { task: Task; schedule: Schedule; color: string; bucket: string; onOpen: () => void }) {
  const p = schedule.tasks.get(task.id);
  return (
    <div className={`srow ${task.done ? 'done' : ''}`}>
      <button
        className={`tick ${task.done ? 'on' : ''}`}
        style={{ '--b': color } as React.CSSProperties}
        onClick={() => updateTask(task.id, { done: !task.done })}
        aria-label={task.done ? 'Mark not done' : 'Mark done'}
      />
      <button className="srow-title" onClick={onOpen}>
        {task.title}
      </button>
      {!task.done && p?.deadline && <span className={`srow-due ${p.late ? 'danger' : ''}`}>due {shortDate(p.deadline).toLowerCase()}</span>}
      <span className="bucket-tag" style={{ '--c': color } as React.CSSProperties}>
        {bucket}
      </span>
    </div>
  );
}

function GoalBars({ schedule, onOpenBucket }: { schedule: Schedule; onOpenBucket: (id: string) => void }) {
  const plan = usePlan();
  const goals = plan.goals.filter((g) => !g.done);
  return (
    <aside className="goals-panel">
      <h2 className="h-small">Goals</h2>
      {goals.length === 0 && <p className="muted">No goals yet. Add one in Buckets.</p>}
      {goals.map((g) => {
        const p = schedule.goals.get(g.id);
        const color = plan.buckets.find((b) => b.id === g.bucketId)?.color;
        const note = !p?.total || !p.projected ? 'Needs tasks' : p.slipDays > 0 ? `Behind by ${p.slipDays} day${p.slipDays === 1 ? '' : 's'}` : !g.targetDate ? 'No target date' : '';
        return (
          <button key={g.id} className="goal-bar" onClick={() => onOpenBucket(g.bucketId)}>
            <span className="goal-bar-top">
              <span className="goal-bar-name">{g.title}</span>
              <span className="goal-bar-pct">{p?.pct ?? 0}%</span>
            </span>
            <span className="goal-bar-track">
              <span style={{ width: `${Math.max(p?.pct ?? 0, 2)}%`, background: color }} />
            </span>
            {note && <span className={`goal-bar-note ${note.startsWith('Behind') ? 'danger' : ''}`}>{note}</span>}
          </button>
        );
      })}
    </aside>
  );
}
