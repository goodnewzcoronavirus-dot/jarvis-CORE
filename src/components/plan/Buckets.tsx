import { useState } from 'react';
import {
  addBucket,
  addGoal,
  addMilestone,
  addTask,
  COLORS,
  deleteBucket,
  deleteGoal,
  deleteMilestone,
  prettyDate,
  progress,
  todayStr,
  updateBucket,
  updateGoal,
  updateMilestone,
  usePlan,
  type Bucket,
  type Goal,
  type Milestone,
} from '../../lib/plan';
import type { Settings } from '../../lib/settings';
import { suggestBreakdown, type SuggestedMilestone } from '../../lib/breakdown';
import { BucketDot, DateChip, shortDate, InlineEdit, ProgressBar, QuickAdd, TaskRow } from './parts';
import { useSchedule, type Schedule } from '../../lib/schedule';

const STARTERS = ['School', 'Work', 'Personal', 'Health'];

export function Buckets({ settings, openId = '', onOpened }: { settings: Settings; openId?: string; onOpened?: () => void }) {
  const plan = usePlan();
  const [selected, setSelected] = useState<string>(openId);
  if (openId && openId !== selected) {
    setSelected(openId);
    onOpened?.();
  }
  const [newName, setNewName] = useState('');
  const bucket = plan.buckets.find((b) => b.id === selected);
  const taken = new Set(plan.buckets.map((b) => b.name.toLowerCase()));
  const starters = plan.buckets.length < 6 ? STARTERS.filter((s) => !taken.has(s.toLowerCase())) : [];

  const create = (name: string) => {
    const n = name.trim();
    if (!n) return;
    const id = addBucket(n);
    setNewName('');
    setSelected(id);
  };

  if (bucket) return <BucketDetail bucket={bucket} settings={settings} onBack={() => setSelected('')} />;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Buckets</h1>
        <span className="muted">The big areas of your life. Goals and tasks live inside.</span>
      </header>

      <div className="bucket-grid">
        {plan.buckets.map((b) => {
          const tasks = plan.tasks.filter((t) => t.bucketId === b.id);
          const goals = plan.goals.filter((g) => g.bucketId === b.id && !g.done);
          const p = progress(tasks);
          const overdue = tasks.filter((t) => !t.done && t.due && t.due < todayStr()).length;
          return (
            <button key={b.id} className="bucket-card" onClick={() => setSelected(b.id)} style={{ '--b': b.color } as React.CSSProperties}>
              <div className="bucket-name">{b.name}</div>
              <div className="muted">
                {goals.length} active goal{goals.length === 1 ? '' : 's'} · {p.total - p.done} open task{p.total - p.done === 1 ? '' : 's'}
                {overdue > 0 && <span className="danger"> · {overdue} overdue</span>}
              </div>
              <ProgressBar pct={p.pct} color={b.color} />
            </button>
          );
        })}
        <div className="bucket-card new">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create(newName)}
            placeholder="New bucket name…"
          />
          <button className="btn small" onClick={() => create(newName)} disabled={!newName.trim()}>
            Add bucket
          </button>
          {starters.length > 0 && (
            <div className="starters">
              {starters.map((s) => (
                <button key={s} className="chip" onClick={() => addBucket(s)}>
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BucketDetail({ bucket, settings, onBack }: { bucket: Bucket; settings: Settings; onBack: () => void }) {
  const plan = usePlan();
  const schedule = useSchedule(plan);
  const [goalTitle, setGoalTitle] = useState('');
  const [showDoneGoals, setShowDoneGoals] = useState(false);
  const goals = plan.goals.filter((g) => g.bucketId === bucket.id);
  const loose = plan.tasks.filter((t) => t.bucketId === bucket.id && !t.goalId);
  const activeGoals = goals.filter((g) => !g.done);
  const doneGoals = goals.filter((g) => g.done);

  const createGoal = () => {
    const t = goalTitle.trim();
    if (!t) return;
    addGoal(bucket.id, t);
    setGoalTitle('');
  };

  return (
    <div className="page">
      <header className="page-head">
        <button className="btn small ghost back-btn" onClick={onBack}>
          ← Buckets
        </button>
        <BucketDot color={bucket.color} />
        <h1>
          <InlineEdit value={bucket.name} onSave={(v) => updateBucket(bucket.id, { name: v })} />
        </h1>
        <div className="color-pick">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${bucket.color === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => updateBucket(bucket.id, { color: c })}
              aria-label="Color"
            />
          ))}
        </div>
        <button
          className="link danger"
          onClick={() => {
            if (confirm(`Delete "${bucket.name}" and everything in it?`)) {
              deleteBucket(bucket.id);
              onBack();
            }
          }}
        >
          Delete
        </button>
      </header>

      <section className="goal-section">
        <h2>Goals</h2>
        {activeGoals.length === 0 && <p className="muted">No goals yet. What big outcome do you want in {bucket.name}?</p>}
        {activeGoals.map((g) => (
          <GoalCard key={g.id} goal={g} bucket={bucket} settings={settings} schedule={schedule} />
        ))}
        <div className="quick-add">
          <span className="plus">◎</span>
          <input
            value={goalTitle}
            onChange={(e) => setGoalTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createGoal()}
            placeholder="Add a goal… (e.g. Run the spring fair with 40 vendors)"
          />
          <button className="btn small" onClick={createGoal} disabled={!goalTitle.trim()}>
            Add goal
          </button>
        </div>
        {doneGoals.length > 0 && (
          <>
            <button className="link" onClick={() => setShowDoneGoals(!showDoneGoals)}>
              {showDoneGoals ? '▾' : '▸'} Completed goals ({doneGoals.length})
            </button>
            {showDoneGoals && doneGoals.map((g) => <GoalCard key={g.id} goal={g} bucket={bucket} settings={settings} schedule={schedule} />)}
          </>
        )}
      </section>

      <section className="goal-section">
        <h2>Other tasks</h2>
        <p className="muted">Things in {bucket.name} that aren’t part of a goal.</p>
        <div className="task-list">
          {sortOpenFirst(loose).map((t) => (
            <TaskRow key={t.id} task={t} planned={schedule.tasks.get(t.id)} />
          ))}
        </div>
        <QuickAdd bucketId={bucket.id} />
      </section>
    </div>
  );
}

function GoalCard({ goal, bucket, settings, schedule }: { goal: Goal; bucket: Bucket; settings: Settings; schedule: Schedule }) {
  const plan = usePlan();
  const [open, setOpen] = useState(!goal.done);
  const [msTitle, setMsTitle] = useState('');
  const [suggest, setSuggest] = useState<null | { status: 'loading' | 'ready' | 'error'; text: string; items: SuggestedMilestone[] }>(null);
  const milestones = plan.milestones.filter((m) => m.goalId === goal.id).sort(byDueThenCreated);
  const goalTasks = plan.tasks.filter((t) => t.goalId === goal.id);
  const direct = goalTasks.filter((t) => !t.milestoneId);
  const p = schedule.goals.get(goal.id) ?? progress(goalTasks);

  const createMs = () => {
    const t = msTitle.trim();
    if (!t) return;
    addMilestone(goal.id, t);
    setMsTitle('');
  };

  const runBreakdown = async () => {
    setOpen(true);
    setSuggest({ status: 'loading', text: '', items: [] });
    try {
      const existing = [...milestones.map((m) => m.title), ...goalTasks.map((t) => t.title)];
      const items = await suggestBreakdown(settings, goal, bucket.name, existing, (text) =>
        setSuggest((s) => (s ? { ...s, text } : s)),
      );
      setSuggest({ status: 'ready', text: '', items });
    } catch (e) {
      setSuggest({ status: 'error', text: (e as Error).message, items: [] });
    }
  };

  return (
    <div className={`goal ${goal.done ? 'done' : ''}`} style={{ borderLeftColor: bucket.color }}>
      <div className="goal-head">
        <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="Expand">
          {open ? '▾' : '▸'}
        </button>
        <input
          type="checkbox"
          className="check"
          checked={goal.done}
          onChange={(e) => updateGoal(goal.id, { done: e.target.checked })}
          title="Mark goal complete"
        />
        <InlineEdit value={goal.title} onSave={(v) => updateGoal(goal.id, { title: v })} className="goal-title" />
        <DateChip value={goal.targetDate} onChange={(v) => updateGoal(goal.id, { targetDate: v })} title="Target date" empty="Set target" />
        <span className="muted nowrap">
          {p.done}/{p.total}
        </span>
      </div>
      <ProgressBar pct={p.pct} color={bucket.color} />

      {open && (
        <div className="goal-body">
          <InlineEdit
            value={goal.why}
            onSave={(v) => updateGoal(goal.id, { why: v })}
            placeholder="Why does this matter? (optional)"
            multiline
            className="goal-why"
          />

          {milestones.map((m) => (
            <MilestoneBlock key={m.id} ms={m} bucketId={bucket.id} schedule={schedule} />
          ))}

          {direct.length > 0 && (
            <div className="task-list">
              {sortOpenFirst(direct).map((t) => (
                <TaskRow key={t.id} task={t} planned={schedule.tasks.get(t.id)} />
              ))}
            </div>
          )}

          <div className="goal-actions">
            <div className="quick-add compact">
              <span className="plus">◆</span>
              <input
                value={msTitle}
                onChange={(e) => setMsTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createMs()}
                placeholder="Add a milestone…"
              />
              <button className="btn small ghost" onClick={createMs} disabled={!msTitle.trim()}>
                Add
              </button>
            </div>
            <QuickAdd bucketId={bucket.id} goalId={goal.id} placeholder="Add a task to this goal…" />
            <div className="row-actions">
              <button className="btn small ghost" onClick={runBreakdown} disabled={suggest?.status === 'loading'}>
                ✨ {suggest?.status === 'loading' ? 'Thinking…' : 'Break it down with AI'}
              </button>
              <button
                className="link danger"
                onClick={() => {
                  if (confirm(`Delete goal "${goal.title}" and its milestones and tasks?`)) deleteGoal(goal.id);
                }}
              >
                Delete goal
              </button>
            </div>
          </div>

          {suggest && <Suggestions state={suggest} goalId={goal.id} bucketId={bucket.id} onClose={() => setSuggest(null)} />}
        </div>
      )}
    </div>
  );
}

function MilestoneBlock({ ms, bucketId, schedule }: { ms: Milestone; bucketId: string; schedule: Schedule }) {
  const plan = usePlan();
  const [open, setOpen] = useState(!ms.done);
  const tasks = plan.tasks.filter((t) => t.milestoneId === ms.id);
  const p = progress(tasks);
  return (
    <div className={`milestone ${ms.done ? 'done' : ''}`}>
      <div className="ms-head">
        <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="Expand">
          {open ? '▾' : '▸'}
        </button>
        <input
          type="checkbox"
          className="check"
          checked={ms.done}
          onChange={(e) => updateMilestone(ms.id, { done: e.target.checked })}
          title="Mark milestone done"
        />
        <span className="ms-icon">◆</span>
        <InlineEdit value={ms.title} onSave={(v) => updateMilestone(ms.id, { title: v })} className="ms-title" />
        <DateChip
          value={ms.dueDate}
          onChange={(v) => updateMilestone(ms.id, { dueDate: v })}
          title={ms.dueDate ? 'Milestone date' : 'Set a date (Jarvis estimates one from the goal target)'}
          empty={schedule.milestoneDates.get(ms.id) ? `~${shortDate(schedule.milestoneDates.get(ms.id)!)}` : 'Set date'}
        />
        <span className="muted nowrap">
          {p.done}/{p.total}
        </span>
        <button
          className="icon-btn"
          title="Delete milestone"
          onClick={() => {
            if (confirm(`Delete milestone "${ms.title}" and its tasks?`)) deleteMilestone(ms.id);
          }}
        >
          ×
        </button>
      </div>
      {open && (
        <div className="ms-body">
          <div className="task-list">
            {sortOpenFirst(tasks).map((t) => (
              <TaskRow key={t.id} task={t} planned={schedule.tasks.get(t.id)} />
            ))}
          </div>
          <QuickAdd bucketId={bucketId} milestoneId={ms.id} placeholder="Add a task to this milestone…" />
        </div>
      )}
    </div>
  );
}

function Suggestions({
  state,
  goalId,
  bucketId,
  onClose,
}: {
  state: { status: 'loading' | 'ready' | 'error'; text: string; items: SuggestedMilestone[] };
  goalId: string;
  bucketId: string;
  onClose: () => void;
}) {
  // keys: "m{i}" for a milestone, "m{i}t{j}" for a task
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setUnchecked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const apply = () => {
    state.items.forEach((m, i) => {
      if (unchecked.has(`m${i}`)) return;
      const msId = addMilestone(goalId, m.title, m.dueDate);
      m.tasks.forEach((t, j) => {
        if (!unchecked.has(`m${i}t${j}`)) addTask({ bucketId, goalId, milestoneId: msId, title: t });
      });
    });
    onClose();
  };

  return (
    <div className="suggest">
      <div className="suggest-head">
        <strong>✨ Suggested plan</strong>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {state.status === 'loading' && <p className="muted">Working on it… {state.text && !state.text.includes('[') ? state.text.slice(0, 80) : ''}</p>}
      {state.status === 'error' && <p className="danger">{state.text}</p>}
      {state.status === 'ready' && (
        <>
          <p className="muted">Uncheck anything you don’t want, then add. You can edit everything afterwards.</p>
          {state.items.map((m, i) => (
            <div key={i} className="suggest-ms">
              <label>
                <input type="checkbox" checked={!unchecked.has(`m${i}`)} onChange={() => toggle(`m${i}`)} />
                <span className="ms-icon">◆</span> <strong>{m.title}</strong>
                {m.dueDate && <span className="muted"> · {prettyDate(m.dueDate)}</span>}
              </label>
              {!unchecked.has(`m${i}`) &&
                m.tasks.map((t, j) => (
                  <label key={j} className="suggest-task">
                    <input type="checkbox" checked={!unchecked.has(`m${i}t${j}`)} onChange={() => toggle(`m${i}t${j}`)} />
                    {t}
                  </label>
                ))}
            </div>
          ))}
          <button className="btn small" onClick={apply}>
            Add to goal
          </button>
        </>
      )}
    </div>
  );
}

function byDueThenCreated(a: { dueDate: string; createdAt: number }, b: { dueDate: string; createdAt: number }) {
  return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.createdAt - b.createdAt;
}

// Open first, then in the order they were written (that's the sequence of steps).
function sortOpenFirst<T extends { done: boolean; createdAt: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt);
}
