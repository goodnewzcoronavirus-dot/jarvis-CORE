import { useCallback, useEffect, useMemo, useState } from 'react';
import { todayStr, updateTask, usePlan } from '../../lib/plan';
import { addDays, useSchedule } from '../../lib/schedule';
import type { CalEvent } from '../../lib/google';
import { shortDate } from './parts';
import {
  AgendaList,
  buildCalData,
  CalendarGrid,
  MiniMonth,
  monthGrid,
  QuickTaskModal,
  shiftMonth,
  TaskSheet,
  weekStart,
  type CalView,
} from './PlanCalendar';

function stored<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export function CalendarHome({
  events,
  onOpenBucket,
  onOpenBuckets,
  onThink,
}: {
  events: CalEvent[];
  onOpenBucket: (id: string) => void;
  onOpenBuckets: () => void;
  onThink: () => void;
}) {
  const plan = usePlan();
  const schedule = useSchedule(plan);
  const today = todayStr();
  const [view, setViewState] = useState<CalView>(() => stored('jarvis-cal-view', 'month'));
  const [anchor, setAnchor] = useState(today);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(stored<string[]>('jarvis-cal-hidden', [])));
  const [openTask, setOpenTask] = useState('');
  const [addDay, setAddDay] = useState('');
  const [dir, setDir] = useState<'next' | 'prev' | 'fade'>('fade');

  const data = useMemo(() => buildCalData(plan, schedule, events), [plan, schedule, events]);

  const setView = (v: CalView) => {
    setDir('fade');
    setViewState(v);
    store('jarvis-cal-view', v);
  };
  const toggleBucket = (id: string) =>
    setHidden((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      store('jarvis-cal-hidden', [...n]);
      return n;
    });

  const shift = useCallback(
    (n: number) => {
      setDir(n > 0 ? 'next' : 'prev');
      setAnchor((a) => (view === 'month' ? shiftMonth(a, n) : addDays(a, (view === 'week' ? 7 : 28) * n)));
    },
    [view],
  );
  const goToday = useCallback(() => {
    setDir('fade');
    setAnchor(today);
  }, [today]);

  // Keyboard: ← → move, T today, M/W/A views, N new task.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (openTask || addDay || el.closest('input, textarea, select, [contenteditable], .modal')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') shift(-1);
      else if (e.key === 'ArrowRight') shift(1);
      else if (e.key === 't') goToday();
      else if (e.key === 'm') setView('month');
      else if (e.key === 'w') setView('week');
      else if (e.key === 'a') setView('agenda');
      else if (e.key === 'n') {
        e.preventDefault();
        setAddDay(today);
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const days = view === 'month' ? monthGrid(anchor) : Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i));
  // Highlight the visible week in the mini month (month view needs no highlight).
  const range: [string, string] = view === 'week' ? [days[0], days[6]] : ['', ''];
  const title =
    view === 'month'
      ? new Date(anchor + 'T00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : view === 'week'
        ? rangeLabel(days[0], days[6])
        : `From ${new Date(anchor + 'T00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`;

  const task = openTask ? plan.tasks.find((t) => t.id === openTask) : undefined;

  if (plan.buckets.length === 0) {
    return (
      <div className="page">
        <div className="empty">
          <h2>Set up your buckets</h2>
          <p>Buckets are the big areas of your life, like school or a project. Each gets a color on the calendar.</p>
          <button className="btn" onClick={onOpenBuckets}>
            Create buckets
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="home">
      {/* Left: new task, mini month, buckets */}
      <aside className="home-left">
        <button className="btn new-task" onClick={() => setAddDay(today)}>
          <span className="plus-ico">+</span> New task
        </button>
        <MiniMonth
          anchor={anchor}
          selected={range}
          data={data}
          hidden={hidden}
          onPick={(d) => {
            setDir(d > anchor ? 'next' : d < anchor ? 'prev' : 'fade');
            setAnchor(d);
          }}
        />
        <div className="cal-list">
          <div className="side-h">Buckets</div>
          {plan.buckets.map((b) => {
            const open = plan.tasks.filter((t) => t.bucketId === b.id && !t.done).length;
            return (
              <div key={b.id} className="cal-list-row">
                <button className={`cal-check ${hidden.has(b.id) ? 'off' : ''}`} style={{ '--c': b.color } as React.CSSProperties} onClick={() => toggleBucket(b.id)} aria-pressed={!hidden.has(b.id)} aria-label={`Show ${b.name}`} />
                <button className="cal-list-name" onClick={() => onOpenBucket(b.id)} title={`Open ${b.name}`}>
                  {b.name}
                </button>
                <span className="cal-list-n">{open || ''}</span>
              </div>
            );
          })}
        </div>
        <div className="kbd-hint">
          <kbd>←</kbd>
          <kbd>→</kbd> move · <kbd>T</kbd> today · <kbd>N</kbd> new
        </div>
      </aside>

      {/* Center: the calendar */}
      <section className="home-main">
        <header className="cal-toolbar">
          <div className="cal-nav">
            <button className="btn ghost small" onClick={goToday}>
              Today
            </button>
            <button className="nav-arrow" onClick={() => shift(-1)} aria-label="Previous">
              ‹
            </button>
            <button className="nav-arrow" onClick={() => shift(1)} aria-label="Next">
              ›
            </button>
            <h1 className="cal-title" key={title}>
              {title}
            </h1>
          </div>
          <div className="seg view-seg" data-view={view}>
            <span className="seg-thumb" aria-hidden="true" />
            {(['month', 'week', 'agenda'] as CalView[]).map((v) => (
              <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </header>

        {view !== 'agenda' && view === 'month' && (
          <div className="cal-dow">
            {days.slice(0, 7).map((d) => (
              <span key={d}>{new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short' })}</span>
            ))}
          </div>
        )}
        <div className={`cal-stage anim-${dir}`} key={`${view}-${view === 'month' ? anchor.slice(0, 7) : view === 'week' ? days[0] : anchor}`}>
          {view === 'agenda' ? (
            <AgendaList start={anchor} data={data} schedule={schedule} hidden={hidden} onOpenTask={setOpenTask} />
          ) : (
            <CalendarGrid days={days} view={view} anchor={anchor} data={data} schedule={schedule} hidden={hidden} onOpenTask={setOpenTask} onDayClick={setAddDay} />
          )}
        </div>
      </section>

      {/* Right: To do */}
      <ToDo schedule={schedule} onOpenTask={setOpenTask} onThink={onThink} />

      {task && (
        <TaskSheet
          task={task}
          planned={schedule.tasks.get(task.id)?.date ?? ''}
          deadline={schedule.tasks.get(task.id)?.deadline ?? ''}
          onClose={() => setOpenTask('')}
          onOpenBucket={onOpenBucket}
        />
      )}
      {addDay && <QuickTaskModal day={addDay} onClose={() => setAddDay('')} />}
    </div>
  );
}

function ToDo({ schedule, onOpenTask, onThink }: { schedule: ReturnType<typeof useSchedule>; onOpenTask: (id: string) => void; onThink: () => void }) {
  const plan = usePlan();
  const today = todayStr();
  const colorOf = (id: string) => plan.buckets.find((b) => b.id === id)?.color ?? '#9aa9ba';
  const todays = schedule.byDay.get(today) ?? [];
  const doneToday = plan.tasks.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toDateString() === new Date().toDateString());
  const total = todays.length + doneToday.length;
  const pct = total ? Math.round((doneToday.length / total) * 100) : 0;

  const horizon = addDays(today, 14);
  const goalBucket = (gid: string) => plan.goals.find((g) => g.id === gid)?.bucketId ?? '';
  const coming = [
    ...plan.tasks.filter((t) => !t.done && t.due && t.due <= horizon).map((t) => ({ id: t.id, title: t.title, date: t.due, kind: 'Task due', bucketId: t.bucketId, task: true })),
    ...plan.milestones
      .filter((m) => !m.done && m.dueDate && m.dueDate <= horizon)
      .map((m) => ({ id: m.id, title: m.title, date: m.dueDate, kind: 'Milestone', bucketId: goalBucket(m.goalId), task: false })),
    ...plan.goals.filter((g) => !g.done && g.targetDate && g.targetDate <= horizon).map((g) => ({ id: g.id, title: g.title, date: g.targetDate, kind: 'Goal target', bucketId: g.bucketId, task: false })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <aside className="home-right">
      <div className="todo-head">
        <div className="side-h">To do today</div>
        <div className="todo-progress">
          <span className="todo-num">
            {doneToday.length}
            <small>/{total}</small>
          </span>
          <span className="todo-bar">
            <span style={{ width: `${pct}%` }} />
          </span>
        </div>
      </div>
      <div className="todo-list">
        {todays.length === 0 && <p className="muted">{doneToday.length ? 'All done for today.' : 'Nothing planned today.'}</p>}
        {todays.map((t, i) => {
          const p = schedule.tasks.get(t.id);
          return (
            <div key={t.id} className={`todo-item ${i === 0 ? 'first' : ''}`} style={{ '--c': colorOf(t.bucketId), '--i': i } as React.CSSProperties}>
              <button className="tick" style={{ '--b': colorOf(t.bucketId) } as React.CSSProperties} onClick={() => updateTask(t.id, { done: true })} aria-label="Mark done" />
              <button className="todo-title" onClick={() => onOpenTask(t.id)}>
                {t.title}
                {p?.deadline && <span className={`todo-due ${p.late ? 'danger' : ''}`}>due {shortDate(p.deadline).toLowerCase()}</span>}
              </button>
            </div>
          );
        })}
        {doneToday.map((t) => (
          <div key={t.id} className="todo-item done" style={{ '--c': colorOf(t.bucketId) } as React.CSSProperties}>
            <button className="tick on" onClick={() => updateTask(t.id, { done: false })} aria-label="Mark not done" />
            <span className="todo-title">{t.title}</span>
          </div>
        ))}
      </div>

      <div className="side-h">Coming up</div>
      <div className="coming">
        {coming.length === 0 && <p className="muted">No deadlines in the next two weeks. Add target dates to your goals so Jarvis can pace you.</p>}
        {coming.map((c) => (
          <button key={c.id} className={`coming-item ${c.date < today ? 'late' : ''}`} style={{ '--c': colorOf(c.bucketId) } as React.CSSProperties} onClick={() => c.task && onOpenTask(c.id)}>
            <span className="coming-date">{shortDate(c.date)}</span>
            <span className="coming-title">{c.title}</span>
            <span className="coming-kind">{c.kind}</span>
          </button>
        ))}
      </div>

      <button className="btn ghost think-btn" onClick={onThink}>
        ✦ Plan with AI
      </button>
    </aside>
  );
}

function rangeLabel(a: string, b: string): string {
  const A = new Date(a + 'T00:00');
  const B = new Date(b + 'T00:00');
  const m = (x: Date) => x.toLocaleDateString(undefined, { month: 'long' });
  return A.getMonth() === B.getMonth() ? `${m(A)} ${A.getDate()} – ${B.getDate()}` : `${m(A).slice(0, 3)} ${A.getDate()} – ${m(B).slice(0, 3)} ${B.getDate()}`;
}
