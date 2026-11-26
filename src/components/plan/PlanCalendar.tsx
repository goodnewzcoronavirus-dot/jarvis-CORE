import { useState } from 'react';
import { todayStr, updateTask, usePlan, type Task } from '../../lib/plan';
import { addDays, type Schedule } from '../../lib/schedule';
import type { CalEvent } from '../../lib/google';
import { shortDate } from './parts';

type View = 'week' | 'month';

// Sunday-start weeks, like Canvas and most school calendars.
function weekStart(d: string): string {
  const day = new Date(d + 'T00:00').getDay();
  return addDays(d, -day);
}

function monthGrid(anchor: string): string[] {
  const first = anchor.slice(0, 8) + '01';
  const start = weekStart(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

interface Marker {
  id: string;
  title: string;
  kind: 'milestone' | 'goal';
  color: string;
}

export function PlanCalendar({
  schedule,
  events = [],
  compact = false,
  onOpenBucket,
}: {
  schedule: Schedule;
  events?: CalEvent[];
  compact?: boolean;
  onOpenBucket?: (id: string) => void;
}) {
  const plan = usePlan();
  const today = todayStr();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(today);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [openTask, setOpenTask] = useState<string>('');
  const [dragOver, setDragOver] = useState('');

  const colorOf = (bucketId: string) => plan.buckets.find((b) => b.id === bucketId)?.color ?? '#9aa9ba';
  const v: View = compact ? 'week' : view;
  const days =
    v === 'week'
      ? compact
        ? Array.from({ length: 7 }, (_, i) => addDays(today, i))
        : Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i))
      : monthGrid(anchor);

  // Tasks by day: open ones on their planned day, done ones on the day they were finished.
  const byDay = new Map<string, Task[]>();
  const put = (d: string, t: Task) => byDay.set(d, [...(byDay.get(d) ?? []), t]);
  for (const [d, list] of schedule.byDay) list.forEach((t) => put(d, t));
  for (const t of plan.tasks) {
    if (t.done && t.doneAt) {
      const x = new Date(t.doneAt);
      put(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`, t);
    }
  }

  const markers = new Map<string, Marker[]>();
  const mark = (d: string, m: Marker) => d && markers.set(d, [...(markers.get(d) ?? []), m]);
  for (const g of plan.goals) {
    if (g.done) continue;
    if (g.targetDate) mark(g.targetDate, { id: g.id, title: g.title, kind: 'goal', color: colorOf(g.bucketId) });
    for (const m of plan.milestones.filter((x) => x.goalId === g.id && !x.done)) {
      if (m.dueDate) mark(m.dueDate, { id: m.id, title: m.title, kind: 'milestone', color: colorOf(g.bucketId) });
    }
  }

  const evByDay = new Map<string, CalEvent[]>();
  for (const e of events) {
    const d = e.allDay ? e.start : todayStrOf(new Date(e.start));
    evByDay.set(d, [...(evByDay.get(d) ?? []), e]);
  }

  const shift = (n: number) => {
    if (v === 'week') setAnchor(addDays(anchor, 7 * n));
    else {
      const x = new Date(anchor + 'T00:00');
      x.setMonth(x.getMonth() + n, 1);
      setAnchor(todayStrOf(x));
    }
  };

  const title =
    v === 'month'
      ? new Date(anchor + 'T00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : `${shortRange(days[0], days[6])}`;

  const limit = v === 'month' ? 3 : compact ? 4 : 8;
  const task = openTask ? plan.tasks.find((t) => t.id === openTask) : undefined;

  return (
    <div className={`cal ${v} ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="cal-bar">
          <div className="cal-nav">
            <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous">
              ‹
            </button>
            <button className="btn ghost small" onClick={() => setAnchor(today)}>
              Today
            </button>
            <button className="icon-btn" onClick={() => shift(1)} aria-label="Next">
              ›
            </button>
            <h2 className="cal-title">{title}</h2>
          </div>
          <div className="seg">
            <button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>
              Week
            </button>
            <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>
              Month
            </button>
          </div>
        </div>
      )}

      {!compact && (
        <div className="legend">
          {plan.buckets.map((b) => (
            <button
              key={b.id}
              className={`legend-item ${hidden.has(b.id) ? 'off' : ''}`}
              onClick={() =>
                setHidden((s) => {
                  const n = new Set(s);
                  if (n.has(b.id)) n.delete(b.id);
                  else n.add(b.id);
                  return n;
                })
              }
              title="Show or hide this bucket"
            >
              <span className="swatch-sm" style={{ background: b.color }} />
              {b.name}
            </button>
          ))}
          {events.length > 0 && (
            <span className="legend-item static">
              <span className="swatch-sm event" />
              Google Calendar
            </span>
          )}
        </div>
      )}

      {v === 'month' && (
        <div className="cal-dow">
          {days.slice(0, 7).map((d) => (
            <span key={d}>{new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short' })}</span>
          ))}
        </div>
      )}

      <div className="cal-grid">
        {days.map((d) => {
          const tasks = (byDay.get(d) ?? []).filter((t) => !hidden.has(t.bucketId));
          const ms = (markers.get(d) ?? []).filter((m) => !hidden.has(bucketOfMarker(m, plan)));
          const evs = evByDay.get(d) ?? [];
          const outside = v === 'month' && d.slice(0, 7) !== anchor.slice(0, 7);
          const items = tasks.length + ms.length + evs.length;
          return (
            <div
              key={d}
              className={`cal-day ${d === today ? 'is-today' : ''} ${d < today ? 'past' : ''} ${outside ? 'outside' : ''} ${dragOver === d ? 'drop' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(d);
              }}
              onDragLeave={() => setDragOver('')}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver('');
                const id = e.dataTransfer.getData('text/task');
                if (id) updateTask(id, { doDate: d < today ? today : d });
              }}
            >
              <div className="cal-date">
                {v === 'week' && <span className="cal-wd">{new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short' })}</span>}
                <span className="cal-dn">{new Date(d + 'T00:00').getDate()}</span>
              </div>
              <div className="cal-items">
                {ms.map((m) => (
                  <div key={m.id} className={`cal-marker ${m.kind}`} style={{ '--c': m.color } as React.CSSProperties} title={`${m.kind === 'goal' ? 'Goal target' : 'Milestone'}: ${m.title}`}>
                    <span className="mk">{m.kind === 'goal' ? '⚑' : '◆'}</span>
                    {m.title}
                  </div>
                ))}
                {evs.slice(0, 3).map((e) => (
                  <div key={e.id} className="cal-event" title={e.title}>
                    {!e.allDay && <span className="t">{new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
                    {e.title}
                  </div>
                ))}
                {tasks.slice(0, Math.max(0, limit - ms.length)).map((t) => {
                  const p = schedule.tasks.get(t.id);
                  return (
                    <button
                      key={t.id}
                      className={`cal-chip ${t.done ? 'done' : ''} ${p?.late ? 'late' : ''}`}
                      style={{ '--c': colorOf(t.bucketId) } as React.CSSProperties}
                      draggable={!t.done}
                      onDragStart={(e) => e.dataTransfer.setData('text/task', t.id)}
                      onClick={() => setOpenTask(t.id)}
                      title={t.title}
                    >
                      {t.title}
                    </button>
                  );
                })}
                {items > limit && <span className="cal-more">+{items - limit} more</span>}
              </div>
            </div>
          );
        })}
      </div>

      {task && (
        <TaskSheet
          task={task}
          planned={schedule.tasks.get(task.id)?.date ?? ''}
          deadline={schedule.tasks.get(task.id)?.deadline ?? ''}
          onClose={() => setOpenTask('')}
          onOpenBucket={onOpenBucket}
        />
      )}
    </div>
  );
}

export function TaskSheet({
  task,
  planned,
  deadline,
  onClose,
  onOpenBucket,
}: {
  task: Task;
  planned: string;
  deadline: string;
  onClose: () => void;
  onOpenBucket?: (id: string) => void;
}) {
  const plan = usePlan();
  const bucket = plan.buckets.find((b) => b.id === task.bucketId);
  const goal = plan.goals.find((g) => g.id === task.goalId);
  const today = todayStr();
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={task.title}>
        <div className="sheet-top" style={{ '--c': bucket?.color } as React.CSSProperties}>
          <span className="sheet-bucket">{bucket?.name}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <h3 className="sheet-title">{task.title}</h3>
        {goal && <p className="muted">Part of: {goal.title}</p>}
        <div className="sheet-facts">
          {!task.done && planned && (
            <span>
              Planned <strong>{shortDate(planned)}</strong>
              {task.doDate ? ' (you set this)' : ''}
            </span>
          )}
          {deadline && (
            <span>
              Due <strong>{shortDate(deadline)}</strong>
            </span>
          )}
        </div>
        {task.notes && <p className="sheet-notes">{task.notes}</p>}
        <div className="row-actions">
          <button
            className="btn"
            onClick={() => {
              updateTask(task.id, { done: !task.done });
              onClose();
            }}
          >
            {task.done ? 'Mark not done' : 'Done'}
          </button>
          {!task.done && (
            <>
              <button className="btn ghost" onClick={() => updateTask(task.id, { doDate: addDays(planned > today ? planned : today, 1) })}>
                Push a day
              </button>
              <label className="btn ghost file-btn">
                Move to…
                <input type="date" min={today} onChange={(e) => e.target.value && updateTask(task.id, { doDate: e.target.value })} />
              </label>
              {task.doDate && (
                <button className="link" onClick={() => updateTask(task.id, { doDate: '' })}>
                  Let Jarvis schedule it
                </button>
              )}
            </>
          )}
        </div>
        {onOpenBucket && bucket && (
          <button
            className="link"
            onClick={() => {
              onClose();
              onOpenBucket(bucket.id);
            }}
          >
            Open {bucket.name} →
          </button>
        )}
      </div>
    </div>
  );
}

function bucketOfMarker(m: Marker, plan: ReturnType<typeof usePlan>): string {
  if (m.kind === 'goal') return plan.goals.find((g) => g.id === m.id)?.bucketId ?? '';
  const goalId = plan.milestones.find((x) => x.id === m.id)?.goalId;
  return plan.goals.find((g) => g.id === goalId)?.bucketId ?? '';
}

function todayStrOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortRange(a: string, b: string): string {
  const A = new Date(a + 'T00:00');
  const B = new Date(b + 'T00:00');
  const m = (x: Date) => x.toLocaleDateString(undefined, { month: 'short' });
  return A.getMonth() === B.getMonth() ? `${m(A)} ${A.getDate()} – ${B.getDate()}` : `${m(A)} ${A.getDate()} – ${m(B)} ${B.getDate()}`;
}
