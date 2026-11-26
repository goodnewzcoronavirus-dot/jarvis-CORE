import { useEffect, useRef, useState } from 'react';
import { addTask, deleteTask, prettyDate, todayStr, updateTask, usePlan, type Priority, type Task } from '../../lib/plan';
import type { Planned } from '../../lib/schedule';

// Text that turns into an input when clicked. Enter or blur saves, Esc cancels.
export function InlineEdit({
  value,
  onSave,
  className = '',
  placeholder = 'Untitled',
  multiline = false,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);
  const save = () => {
    setEditing(false);
    const v = draft.trim();
    if (v !== value && (v || multiline)) onSave(v);
    else setDraft(value);
  };
  if (!editing) {
    return (
      <span
        className={`inline-edit ${className} ${value ? '' : 'placeholder'}`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value || placeholder}
      </span>
    );
  }
  const props = {
    ref,
    value: draft,
    className: `inline-input ${className}`,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: save,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
        e.preventDefault();
        save();
      }
      if (e.key === 'Escape') {
        setDraft(value);
        setEditing(false);
      }
    },
  };
  return multiline ? <textarea rows={2} {...props} /> : <input {...props} />;
}

export function DateField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="date-field">
      <span className="label">{label}</span>
      <span className="date-field-row">
        <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
        {value && (
          <button className="icon-btn" onClick={() => onChange('')} aria-label={`Clear ${label}`}>
            ✕
          </button>
        )}
      </span>
    </label>
  );
}

// Small date chip with a native picker on top. Used where a date is set by hand (goals, milestones).
export function DateChip({ value, onChange, title, empty = 'Set date' }: { value: string; onChange: (v: string) => void; title: string; empty?: string }) {
  const overdue = value && value < todayStr();
  return (
    <label className={`date-chip ${value ? 'set' : ''} ${overdue ? 'overdue' : ''}`} title={title}>
      <span>{value ? shortDate(value) : empty}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function shortDate(d: string): string {
  if (!d) return '';
  const t = todayStr();
  if (d === t) return 'Today';
  const days = Math.round((new Date(d + 'T00:00').getTime() - new Date(t + 'T00:00').getTime()) / 86400000);
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days < 7) return new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short' });
  return prettyDate(d).replace(/^\w+, /, '');
}

export function BucketDot({ color }: { color: string }) {
  return <span className="bucket-dot" style={{ background: color }} />;
}

const PRIORITY_OPTS: { v: Priority; label: string }[] = [
  { v: 0, label: 'Auto' },
  { v: 1, label: 'High' },
  { v: 2, label: 'Medium' },
  { v: 3, label: 'Low' },
];

// One task line. Shows Jarvis's planned day and the effective deadline.
export function TaskRow({ task, planned, showContext = false, showDay = true }: { task: Task; planned?: Planned; showContext?: boolean; showDay?: boolean }) {
  const plan = usePlan();
  const [open, setOpen] = useState(false);
  const bucket = plan.buckets.find((b) => b.id === task.bucketId);
  const goal = plan.goals.find((g) => g.id === task.goalId);
  const ms = plan.milestones.find((m) => m.id === task.milestoneId);
  const urgency = task.done ? 'done' : planned?.urgency ?? 'normal';

  return (
    <div className={`task u-${urgency} ${task.done ? 'done' : ''}`}>
      <div className="task-main">
        <button
          className={`tick ${task.done ? 'on' : ''}`}
          onClick={() => updateTask(task.id, { done: !task.done })}
          aria-label={task.done ? 'Mark not done' : 'Mark done'}
          style={bucket ? ({ '--b': bucket.color } as React.CSSProperties) : undefined}
        />
        <div className="task-body">
          <InlineEdit value={task.title} onSave={(v) => updateTask(task.id, { title: v })} className="task-title" />
          {(showContext && bucket) || task.notes ? (
            <div className="task-context">
              {showContext && bucket && (
                <>
                  <BucketDot color={bucket.color} />
                  <span>{bucket.name}</span>
                  {goal && <span className="sep">/</span>}
                  {goal && <span>{goal.title}</span>}
                  {ms && <span className="sep">/</span>}
                  {ms && <span>{ms.title}</span>}
                </>
              )}
              {task.notes && <span className="has-notes" title={task.notes}>¶</span>}
            </div>
          ) : null}
        </div>
        <div className="task-meta">
          {!task.done && planned?.deadline && (
            <span className={`deadline-tag ${planned.late ? 'late' : ''}`} title={`Deadline from ${planned.deadlineFrom}`}>
              {planned.late && planned.deadline < todayStr() ? 'OVERDUE' : `DUE ${shortDate(planned.deadline).toUpperCase()}`}
            </span>
          )}
          {!task.done && showDay && planned && (
            <span className={`day-tag ${planned.pinned ? 'pinned' : ''}`} title={planned.pinned ? 'You set this day' : 'Scheduled by Jarvis'}>
              {shortDate(planned.date)}
            </span>
          )}
          <button className={`icon-btn more ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-label="Task details">
            ⋯
          </button>
        </div>
      </div>
      {open && (
        <div className="task-extra">
          <div className="extra-grid">
            <DateField label="Deadline" value={task.due} onChange={(v) => updateTask(task.id, { due: v })} />
            <DateField label="Do on (pins it)" value={task.doDate} onChange={(v) => updateTask(task.id, { doDate: v })} />
            <label className="date-field">
              <span className="label">Priority</span>
              <select value={task.priority} onChange={(e) => updateTask(task.id, { priority: Number(e.target.value) as Priority })}>
                {PRIORITY_OPTS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <InlineEdit value={task.notes} onSave={(v) => updateTask(task.id, { notes: v })} placeholder="Add notes or links…" multiline className="task-notes" />
          <button
            className="link danger"
            onClick={() => {
              if (confirm(`Delete "${task.title}"?`)) deleteTask(task.id);
            }}
          >
            Delete task
          </button>
        </div>
      )}
    </div>
  );
}

// Add-a-task line used inside buckets/goals/milestones. Each line of a paste becomes a task.
export function QuickAdd({
  bucketId,
  goalId = '',
  milestoneId = '',
  placeholder = 'Add a task…',
}: {
  bucketId: string;
  goalId?: string;
  milestoneId?: string;
  placeholder?: string;
}) {
  const [title, setTitle] = useState('');
  const submit = () => {
    const lines = title.split('\n').map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean);
    lines.forEach((t) => addTask({ bucketId, goalId, milestoneId, title: t }));
    setTitle('');
  };
  return (
    <div className="quick-add">
      <span className="plus">+</span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (text.includes('\n')) {
            e.preventDefault();
            setTitle(text);
            setTimeout(() => {
              text
                .split('\n')
                .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
                .filter(Boolean)
                .forEach((t) => addTask({ bucketId, goalId, milestoneId, title: t }));
              setTitle('');
            });
          }
        }}
        placeholder={placeholder}
      />
    </div>
  );
}

export function ProgressBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="pbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="pbar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
