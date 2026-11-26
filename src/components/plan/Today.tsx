import { useState } from 'react';
import { prettyDate, todayStr, usePlan, type Task } from '../../lib/plan';
import { BucketDot, QuickAdd, TaskRow } from './parts';

// Sort: priority first, then due date, then oldest first.
const byPriority = (a: Task, b: Task) =>
  a.priority - b.priority || (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt;

export function Today({ onOpenBuckets }: { onOpenBuckets: () => void }) {
  const plan = usePlan();
  const [filter, setFilter] = useState(''); // bucket id or ''
  const [showDone, setShowDone] = useState(false);
  const today = todayStr();
  const week = todayStr(7);

  if (plan.buckets.length === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Today</h1>
        </header>
        <div className="empty">
          <h2>Start by making your buckets</h2>
          <p>Buckets are the big areas of your life, like school, each project, health, personal. Goals and tasks go inside them.</p>
          <button className="btn" onClick={onOpenBuckets}>
            Set up buckets
          </button>
        </div>
      </div>
    );
  }

  const open = plan.tasks.filter((t) => !t.done && (!filter || t.bucketId === filter));
  const groups: { key: string; label: string; tasks: Task[]; tone?: string }[] = [
    { key: 'overdue', label: 'Overdue', tasks: open.filter((t) => t.due && t.due < today), tone: 'danger' },
    { key: 'today', label: 'Today', tasks: open.filter((t) => t.due === today) },
    { key: 'week', label: 'Next 7 days', tasks: open.filter((t) => t.due > today && t.due <= week) },
    { key: 'later', label: 'Later', tasks: open.filter((t) => t.due > week) },
    { key: 'nodate', label: 'No date', tasks: open.filter((t) => !t.due) },
  ];
  for (const g of groups) {
    g.tasks.sort(g.key === 'week' || g.key === 'later' ? (a, b) => a.due.localeCompare(b.due) || a.priority - b.priority : byPriority);
  }

  const doneToday = plan.tasks.filter((t) => t.done && t.doneAt && todayStr() === dayOf(t.doneAt) && (!filter || t.bucketId === filter));

  // Milestones and goals with deadlines in the next 14 days.
  const horizon = todayStr(14);
  const goalBucket = (goalId: string) => plan.goals.find((g) => g.id === goalId)?.bucketId ?? '';
  const deadlines = [
    ...plan.milestones
      .filter((m) => !m.done && m.dueDate && m.dueDate <= horizon)
      .map((m) => ({ id: m.id, title: m.title, date: m.dueDate, kind: 'Milestone', bucketId: goalBucket(m.goalId) })),
    ...plan.goals
      .filter((g) => !g.done && g.targetDate && g.targetDate <= horizon)
      .map((g) => ({ id: g.id, title: g.title, date: g.targetDate, kind: 'Goal', bucketId: g.bucketId })),
  ]
    .filter((d) => !filter || d.bucketId === filter)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="page">
      <header className="page-head">
        <h1>Today</h1>
        <span className="pill">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      </header>

      <div className="filters">
        <button className={`chip ${!filter ? 'on' : ''}`} onClick={() => setFilter('')}>
          All
        </button>
        {plan.buckets.map((b) => (
          <button key={b.id} className={`chip ${filter === b.id ? 'on' : ''}`} onClick={() => setFilter(filter === b.id ? '' : b.id)}>
            <BucketDot color={b.color} />
            {b.name}
          </button>
        ))}
      </div>

      <QuickAdd bucketId={filter || undefined} defaultDue={today} placeholder="Add a task for today… (Enter)" />

      {deadlines.length > 0 && (
        <section className="deadlines">
          <h3>Coming up (next 2 weeks)</h3>
          <div className="deadline-list">
            {deadlines.map((d) => {
              const b = plan.buckets.find((x) => x.id === d.bucketId);
              return (
                <div key={d.id} className={`deadline ${d.date < today ? 'overdue' : ''}`}>
                  <span className="deadline-date">{prettyDate(d.date)}</span>
                  <span className="deadline-title">
                    {b && <BucketDot color={b.color} />}
                    {d.title}
                  </span>
                  <span className="muted">{d.kind}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {groups.map(
        (g) =>
          g.tasks.length > 0 && (
            <section key={g.key} className="task-group">
              <h3 className={g.tone}>
                {g.label} <span className="count">{g.tasks.length}</span>
              </h3>
              <div className="task-list">
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} showContext />
                ))}
              </div>
            </section>
          ),
      )}

      {open.length === 0 && <p className="muted center">Nothing open{filter ? ' in this bucket' : ''}. Add a task above or plan goals in Buckets.</p>}

      {doneToday.length > 0 && (
        <section className="task-group">
          <h3>
            <button className="link" onClick={() => setShowDone(!showDone)}>
              {showDone ? '▾' : '▸'} Done today <span className="count">{doneToday.length}</span>
            </button>
          </h3>
          {showDone && (
            <div className="task-list">
              {doneToday.map((t) => (
                <TaskRow key={t.id} task={t} showContext />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
