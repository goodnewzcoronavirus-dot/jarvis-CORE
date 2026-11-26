import { useEffect, useRef, useState } from 'react';
import { addTask, todayStr, updateTask, usePlan, type PlanData, type Task } from '../../lib/plan';
import { addDays, type Schedule } from '../../lib/schedule';
import type { CalEvent } from '../../lib/google';
import { shortDate } from './parts';

export type CalView = 'month' | 'week' | 'agenda';

// ---------- date helpers ----------
export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function weekStart(d: string): string {
  return addDays(d, -new Date(d + 'T00:00').getDay());
}
export function monthGrid(anchor: string): string[] {
  const start = weekStart(anchor.slice(0, 8) + '01');
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function shiftMonth(anchor: string, n: number): string {
  const x = new Date(anchor + 'T00:00');
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  return iso(x);
}
const dayNum = (d: string) => new Date(d + 'T00:00').getDate();
const weekday = (d: string) => new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short' });

// ---------- calendar data ----------
interface Marker {
  id: string;
  title: string;
  kind: 'milestone' | 'goal';
  color: string;
  bucketId: string;
}

export interface CalData {
  tasks: Map<string, Task[]>;
  markers: Map<string, Marker[]>;
  events: Map<string, CalEvent[]>;
  colorOf: (bucketId: string) => string;
}

export function buildCalData(plan: PlanData, schedule: Schedule, events: CalEvent[] = []): CalData {
  const colorOf = (id: string) => plan.buckets.find((b) => b.id === id)?.color ?? '#9aa9ba';
  const tasks = new Map<string, Task[]>();
  const put = (d: string, t: Task) => tasks.set(d, [...(tasks.get(d) ?? []), t]);
  for (const [d, list] of schedule.byDay) list.forEach((t) => put(d, t));
  for (const t of plan.tasks) if (t.done && t.doneAt) put(iso(new Date(t.doneAt)), t);

  const markers = new Map<string, Marker[]>();
  const mark = (d: string, m: Marker) => markers.set(d, [...(markers.get(d) ?? []), m]);
  for (const g of plan.goals) {
    if (g.done) continue;
    if (g.targetDate) mark(g.targetDate, { id: g.id, title: g.title, kind: 'goal', color: colorOf(g.bucketId), bucketId: g.bucketId });
    for (const m of plan.milestones) {
      if (m.goalId === g.id && !m.done && m.dueDate) mark(m.dueDate, { id: m.id, title: m.title, kind: 'milestone', color: colorOf(g.bucketId), bucketId: g.bucketId });
    }
  }

  const ev = new Map<string, CalEvent[]>();
  for (const e of events) {
    const d = e.allDay ? e.start : iso(new Date(e.start));
    ev.set(d, [...(ev.get(d) ?? []), e]);
  }
  return { tasks, markers, events: ev, colorOf };
}

// ---------- chip ----------
function Chip({ t, schedule, color, index, onOpen }: { t: Task; schedule: Schedule; color: string; index: number; onOpen: (id: string) => void }) {
  const p = schedule.tasks.get(t.id);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      className={`cal-chip ${t.done ? 'done' : ''} ${p?.late ? 'late' : ''} ${dragging ? 'dragging' : ''}`}
      style={{ '--c': color, '--i': index } as React.CSSProperties}
      draggable={!t.done}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task', t.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
        document.body.classList.add('is-dragging');
      }}
      onDragEnd={() => {
        setDragging(false);
        document.body.classList.remove('is-dragging');
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(t.id);
      }}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(t.id)}
      title={t.title}
      data-cursor-color={color}
    >
      <button
        className="chip-tick"
        aria-label={t.done ? 'Mark not done' : 'Mark done'}
        onClick={(e) => {
          e.stopPropagation();
          updateTask(t.id, { done: !t.done });
        }}
      />
      <span className="chip-text">{t.title}</span>
    </div>
  );
}

// ---------- grid (month / week) ----------
export function CalendarGrid({
  days,
  view,
  anchor,
  data,
  schedule,
  hidden,
  compact = false,
  onOpenTask,
  onDayClick,
}: {
  days: string[];
  view: 'month' | 'week';
  anchor: string;
  data: CalData;
  schedule: Schedule;
  hidden: Set<string>;
  compact?: boolean;
  onOpenTask: (id: string) => void;
  onDayClick?: (day: string) => void;
}) {
  const today = todayStr();
  const [over, setOver] = useState('');
  const limit = view === 'month' ? 3 : compact ? 5 : 12;

  return (
    <div className={`cal-grid ${view} ${compact ? 'compact' : ''}`}>
      {days.map((d, di) => {
        const tasks = (data.tasks.get(d) ?? []).filter((t) => !hidden.has(t.bucketId));
        const ms = (data.markers.get(d) ?? []).filter((m) => !hidden.has(m.bucketId));
        const evs = data.events.get(d) ?? [];
        const outside = view === 'month' && d.slice(0, 7) !== anchor.slice(0, 7);
        const shown = Math.max(0, limit - ms.length - Math.min(evs.length, 2));
        const extra = tasks.length - shown;
        const open = tasks.filter((t) => !t.done).length;
        return (
          <div
            key={d}
            className={`cal-day ${d === today ? 'is-today' : ''} ${d < today ? 'past' : ''} ${outside ? 'outside' : ''} ${over === d ? 'drop' : ''}`}
            style={{ '--d': di } as React.CSSProperties}
            onClick={() => onDayClick?.(d)}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (over !== d) setOver(d);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver('');
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOver('');
              document.body.classList.remove('is-dragging');
              const id = e.dataTransfer.getData('text/task');
              if (id) updateTask(id, { doDate: d < today ? today : d });
            }}
            data-cursor="add"
          >
            <div className="cal-date">
              {view === 'week' && <span className="cal-wd">{weekday(d)}</span>}
              <span className="cal-dn">{dayNum(d)}</span>
              {view === 'week' && !compact && open > 0 && <span className="cal-load">{open}</span>}
              <span className="cal-add" aria-hidden="true">
                +
              </span>
            </div>
            <div className="cal-items">
              {ms.map((m) => (
                <div key={m.id} className={`cal-marker k-${m.kind}`} style={{ '--c': m.color } as React.CSSProperties} title={`${m.kind === 'goal' ? 'Goal target' : 'Milestone'}: ${m.title}`}>
                  <span className="mk">{m.kind === 'goal' ? '⚑' : '◆'}</span>
                  <span className="chip-text">{m.title}</span>
                </div>
              ))}
              {evs.slice(0, 2).map((e) => (
                <div key={e.id} className="cal-event" title={e.title}>
                  {!e.allDay && <span className="t">{new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
                  {e.title}
                </div>
              ))}
              {tasks.slice(0, shown).map((t, i) => (
                <Chip key={t.id} t={t} schedule={schedule} color={data.colorOf(t.bucketId)} index={i} onOpen={onOpenTask} />
              ))}
              {extra > 0 && (
                <button
                  className="cal-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTask(tasks[shown].id);
                  }}
                >
                  +{extra} more
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- agenda ----------
export function AgendaList({
  start,
  data,
  schedule,
  hidden,
  onOpenTask,
}: {
  start: string;
  data: CalData;
  schedule: Schedule;
  hidden: Set<string>;
  onOpenTask: (id: string) => void;
}) {
  const days = Array.from({ length: 28 }, (_, i) => addDays(start, i));
  const rows = days
    .map((d) => ({
      d,
      tasks: (data.tasks.get(d) ?? []).filter((t) => !hidden.has(t.bucketId)),
      ms: (data.markers.get(d) ?? []).filter((m) => !hidden.has(m.bucketId)),
      evs: data.events.get(d) ?? [],
    }))
    .filter((r) => r.tasks.length || r.ms.length || r.evs.length);
  return (
    <div className="agenda">
      {rows.length === 0 && <p className="muted">Nothing in the next four weeks.</p>}
      {rows.map(({ d, tasks, ms, evs }, ri) => (
        <section key={d} className={`agenda-day ${d === todayStr() ? 'is-today' : ''}`} style={{ '--d': ri } as React.CSSProperties}>
          <div className="agenda-date">
            <span className="cal-wd">{weekday(d)}</span>
            <span className="agenda-dn">{dayNum(d)}</span>
            <span className="cal-wd">{new Date(d + 'T00:00').toLocaleDateString(undefined, { month: 'short' })}</span>
          </div>
          <div className="agenda-items">
            {ms.map((m) => (
              <div key={m.id} className={`cal-marker k-${m.kind}`} style={{ '--c': m.color } as React.CSSProperties}>
                <span className="mk">{m.kind === 'goal' ? '⚑' : '◆'}</span>
                <span className="chip-text">
                  {m.kind === 'goal' ? 'Goal target: ' : 'Milestone: '}
                  {m.title}
                </span>
              </div>
            ))}
            {evs.map((e) => (
              <div key={e.id} className="cal-event">
                {e.title}
              </div>
            ))}
            {tasks.map((t, i) => (
              <Chip key={t.id} t={t} schedule={schedule} color={data.colorOf(t.bucketId)} index={i} onOpen={onOpenTask} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------- mini month ----------
export function MiniMonth({
  anchor,
  selected,
  data,
  hidden,
  onPick,
}: {
  anchor: string;
  selected: [string, string];
  data: CalData;
  hidden: Set<string>;
  onPick: (d: string) => void;
}) {
  const [month, setMonth] = useState(anchor);
  useEffect(() => setMonth(anchor), [anchor]);
  const days = monthGrid(month);
  const today = todayStr();
  return (
    <div className="mini">
      <div className="mini-head">
        <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
          ‹
        </button>
        <span>{new Date(month + 'T00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="mini-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => (
          <span key={i} className="mini-dow">
            {l}
          </span>
        ))}
        {days.map((d) => {
          const colors = [...new Set((data.tasks.get(d) ?? []).filter((t) => !t.done && !hidden.has(t.bucketId)).map((t) => data.colorOf(t.bucketId)))].slice(0, 3);
          const inRange = d >= selected[0] && d <= selected[1];
          return (
            <button
              key={d}
              className={`mini-day ${d === today ? 'is-today' : ''} ${d.slice(0, 7) !== month.slice(0, 7) ? 'outside' : ''} ${inRange ? 'in-range' : ''}`}
              onClick={() => onPick(d)}
            >
              {dayNum(d)}
              <span className="mini-dots">
                {colors.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- quick add for a day ----------
export function QuickTaskModal({ day, onClose }: { day: string; onClose: () => void }) {
  const plan = usePlan();
  const [title, setTitle] = useState('');
  const [bucketId, setBucketId] = useState(() => {
    try {
      return localStorage.getItem('jarvis-last-bucket') || '';
    } catch {
      return '';
    }
  });
  const [goalId, setGoalId] = useState('');
  const [date, setDate] = useState(day);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const bucket = plan.buckets.some((b) => b.id === bucketId) ? bucketId : plan.buckets[0]?.id ?? '';
  const goals = plan.goals.filter((g) => g.bucketId === bucket && !g.done);
  const color = plan.buckets.find((b) => b.id === bucket)?.color;
  const save = () => {
    const t = title.trim();
    if (!t || !bucket) return;
    addTask({ bucketId: bucket, goalId: goals.some((g) => g.id === goalId) ? goalId : '', title: t, doDate: date });
    try {
      localStorage.setItem('jarvis-last-bucket', bucket);
    } catch {
      /* ignore */
    }
    onClose();
  };
  if (!plan.buckets.length) return null;
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal quick" onClick={(e) => e.stopPropagation()} style={{ '--c': color } as React.CSSProperties} role="dialog" aria-label="New task">
        <div className="quick-date">
          New task on{' '}
          <label className="quick-date-pick">
            {date === todayStr() ? 'today' : new Date(date + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
        </div>
        <input
          ref={ref}
          className="quick-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="What needs doing?"
        />
        <div className="bucket-pills">
          {plan.buckets.map((b) => (
            <button
              key={b.id}
              className={`bucket-pill ${b.id === bucket ? 'on' : ''}`}
              style={{ '--c': b.color } as React.CSSProperties}
              onClick={() => {
                setBucketId(b.id);
                setGoalId('');
              }}
            >
              {b.name}
            </button>
          ))}
        </div>
        <div className="quick-row">
          <select value={goalId} onChange={(e) => setGoalId(e.target.value)} aria-label="Goal">
            <option value="">No goal</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={save} disabled={!title.trim()}>
            Add task
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- task details ----------
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
  const ms = plan.milestones.find((m) => m.id === task.milestoneId);
  const today = todayStr();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={task.title} style={{ '--c': bucket?.color } as React.CSSProperties}>
        <div className="sheet-top">
          <span className="sheet-bucket">{bucket?.name}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <h3 className="sheet-title">{task.title}</h3>
        {(goal || ms) && (
          <p className="muted sheet-path">
            {goal?.title}
            {ms ? ` › ${ms.title}` : ''}
          </p>
        )}
        <div className="sheet-facts">
          {!task.done && planned && (
            <span>
              Planned <strong>{shortDate(planned)}</strong>
              {task.doDate ? ' · you set this' : ' · by Jarvis'}
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

// Compact 7-day calendar used on the Today page.
export function PlanCalendar({ schedule, onOpenBucket }: { schedule: Schedule; compact?: boolean; onOpenBucket?: (id: string) => void }) {
  const plan = usePlan();
  const [open, setOpen] = useState('');
  const [addDay, setAddDay] = useState('');
  const today = todayStr();
  const data = buildCalData(plan, schedule);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const task = open ? plan.tasks.find((t) => t.id === open) : undefined;
  return (
    <>
      <CalendarGrid days={days} view="week" anchor={today} data={data} schedule={schedule} hidden={new Set()} compact onOpenTask={setOpen} onDayClick={setAddDay} />
      {task && <TaskSheet task={task} planned={schedule.tasks.get(task.id)?.date ?? ''} deadline={schedule.tasks.get(task.id)?.deadline ?? ''} onClose={() => setOpen('')} onOpenBucket={onOpenBucket} />}
      {addDay && <QuickTaskModal day={addDay} onClose={() => setAddDay('')} />}
    </>
  );
}
