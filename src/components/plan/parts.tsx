import { useEffect, useRef, useState } from 'react';
import {
  addTask,
  deleteTask,
  prettyDate,
  todayStr,
  updateTask,
  usePlan,
  type Priority,
  type Task,
} from '../../lib/plan';

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
        title="Click to edit"
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

export function DateInput({ value, onChange, title = 'Due date' }: { value: string; onChange: (v: string) => void; title?: string }) {
  const overdue = value && value < todayStr();
  return (
    <label className={`date-chip ${value ? 'set' : ''} ${overdue ? 'overdue' : ''}`} title={title}>
      <span>{value ? prettyDate(value) : '📅'}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const PRI_LABEL: Record<Priority, string> = { 1: 'High', 2: 'Med', 3: 'Low' };

export function PriorityChip({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  const next = (value === 1 ? 2 : value === 2 ? 3 : 1) as Priority;
  return (
    <button className={`pri pri-${value}`} onClick={() => onChange(next)} title="Priority (click to change)">
      {PRI_LABEL[value]}
    </button>
  );
}

export function BucketDot({ color }: { color: string }) {
  return <span className="bucket-dot" style={{ background: color }} />;
}

// One task line. `context` shows where the task lives (used on the Today view).
export function TaskRow({ task, showContext = false }: { task: Task; showContext?: boolean }) {
  const plan = usePlan();
  const [open, setOpen] = useState(false);
  const bucket = plan.buckets.find((b) => b.id === task.bucketId);
  const goal = plan.goals.find((g) => g.id === task.goalId);
  const ms = plan.milestones.find((m) => m.id === task.milestoneId);
  return (
    <div className={`task ${task.done ? 'done' : ''}`}>
      <div className="task-main">
        <input
          type="checkbox"
          className="check"
          checked={task.done}
          onChange={(e) => updateTask(task.id, { done: e.target.checked })}
          aria-label="Done"
        />
        <div className="task-body">
          <InlineEdit value={task.title} onSave={(v) => updateTask(task.id, { title: v })} className="task-title" />
          {showContext && bucket && (
            <div className="task-context">
              <BucketDot color={bucket.color} />
              {bucket.name}
              {goal && ` › ${goal.title}`}
              {ms && ` › ${ms.title}`}
            </div>
          )}
        </div>
        <div className="task-meta">
          <PriorityChip value={task.priority} onChange={(p) => updateTask(task.id, { priority: p })} />
          <DateInput value={task.due} onChange={(v) => updateTask(task.id, { due: v })} />
          <button className="icon-btn" onClick={() => setOpen(!open)} title="Notes">
            {task.notes ? '📝' : '⋯'}
          </button>
        </div>
      </div>
      {open && (
        <div className="task-extra">
          <InlineEdit
            value={task.notes}
            onSave={(v) => updateTask(task.id, { notes: v })}
            placeholder="Add notes…"
            multiline
            className="task-notes"
          />
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

// Add-a-task line. If bucketId is fixed it hides the bucket picker.
export function QuickAdd({
  bucketId,
  goalId = '',
  milestoneId = '',
  defaultDue = '',
  placeholder = 'Add a task…',
}: {
  bucketId?: string;
  goalId?: string;
  milestoneId?: string;
  defaultDue?: string;
  placeholder?: string;
}) {
  const plan = usePlan();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(defaultDue);
  const [priority, setPriority] = useState<Priority>(2);
  const [pickBucket, setPickBucket] = useState('');
  const chosenBucket = bucketId ?? (pickBucket || plan.buckets[0]?.id || '');

  const submit = () => {
    const t = title.trim();
    if (!t || !chosenBucket) return;
    addTask({ bucketId: chosenBucket, goalId, milestoneId, title: t, due, priority });
    setTitle('');
    setDue(defaultDue);
    setPriority(2);
  };

  if (!bucketId && plan.buckets.length === 0) return null;

  return (
    <div className="quick-add">
      <span className="plus">+</span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={placeholder}
      />
      {!bucketId && (
        <select value={chosenBucket} onChange={(e) => setPickBucket(e.target.value)} title="Bucket">
          {plan.buckets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
      <PriorityChip value={priority} onChange={setPriority} />
      <DateInput value={due} onChange={setDue} />
      <button className="btn small" onClick={submit} disabled={!title.trim()}>
        Add
      </button>
    </div>
  );
}

export function ProgressBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="pbar">
      <div className="pbar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
