import { todayStr, usePlan } from '../../lib/plan';
import { addDays, daysBetween, type Schedule } from '../../lib/schedule';
import { BucketDot, shortDate } from './parts';

// One flight path per goal: % done, and a time axis from today showing
// milestones (◆), the projected finish (●) and the target (|).
export function Telemetry({ schedule, onOpenBucket }: { schedule: Schedule; onOpenBucket: (id: string) => void }) {
  const plan = usePlan();
  const today = todayStr();
  const active = plan.goals.filter((g) => !g.done);

  const allTasks = plan.tasks;
  const overall = allTasks.length ? Math.round((allTasks.filter((t) => t.done).length / allTasks.length) * 100) : 0;

  return (
    <aside className="telemetry">
      <div className="tele-head">
        <span className="label">Telemetry</span>
        <span className="mono muted">
          {overall}% of all tasks · {active.length} active goals
        </span>
      </div>

      {active.length === 0 && <p className="muted">No active goals. Add one in Buckets to see its flight path here.</p>}

      {plan.buckets.map((b) => {
        const goals = active.filter((g) => g.bucketId === b.id);
        if (!goals.length) return null;
        return (
          <section key={b.id} className="tele-bucket">
            <button className="tele-bucket-name" onClick={() => onOpenBucket(b.id)}>
              <BucketDot color={b.color} />
              {b.name}
            </button>
            {goals.map((g) => {
              const p = schedule.goals.get(g.id);
              if (!p) return null;
              const dates = [p.target, p.projected, ...p.milestoneMarks.map((m) => m.date)].filter(Boolean);
              const end = [addDays(today, 14), ...dates].sort().pop()!;
              const span = Math.max(daysBetween(today, end), 1);
              const x = (d: string) => `${Math.min(100, Math.max(0, (daysBetween(today, d) / span) * 100))}%`;
              const status = !p.total
                ? { text: 'NO TASKS YET', cls: 'idle' }
                : p.done === p.total
                  ? { text: 'COMPLETE', cls: 'ok' }
                  : !p.projected
                    ? { text: 'NEEDS TASKS', cls: 'idle' }
                    : !p.target
                    ? { text: `LANDS ${shortDate(p.projected).toUpperCase()}`, cls: 'idle' }
                    : p.slipDays > 0
                      ? { text: `+${p.slipDays}D PAST TARGET`, cls: 'late' }
                      : { text: 'ON TRACK', cls: 'ok' };
              return (
                <div key={g.id} className="tele-goal">
                  <div className="tele-row">
                    <span className="tele-title">{g.title}</span>
                    <span className="tele-pct">
                      {p.pct}
                      <small>%</small>
                    </span>
                  </div>
                  <div className="tele-progress">
                    <div style={{ width: `${p.pct}%` }} />
                  </div>
                  <div className="track" aria-hidden="true">
                    <div className="track-line" />
                    <span className="mark now" style={{ left: '0%' }} />
                    {p.milestoneMarks
                      .filter((m) => m.date)
                      .map((m) => (
                        <span
                          key={m.id}
                          className={`mark ms ${m.done ? 'done' : ''} ${!m.done && m.date < today ? 'late' : ''}`}
                          style={{ left: x(m.date) }}
                          title={`${m.title} · ${shortDate(m.date)}`}
                        />
                      ))}
                    {p.projected && p.done < p.total && <span className="mark proj" style={{ left: x(p.projected) }} title={`Projected finish ${shortDate(p.projected)}`} />}
                    {p.target && <span className="mark target" style={{ left: x(p.target) }} title={`Target ${shortDate(p.target)}`} />}
                  </div>
                  <div className="tele-read mono">
                    <span className="count">
                      {p.done}/{p.total}
                    </span>
                    <span className={`status ${status.cls}`}>{status.text}</span>
                    {p.nextMilestone && (
                      <span className="next">
                        ◆ {p.nextMilestone.title}
                        {p.nextMilestone.date ? ` · ${shortDate(p.nextMilestone.date)}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
      <div className="tele-legend mono">
        <span>
          <i className="lg now" /> today
        </span>
        <span>
          <i className="lg ms" /> milestone
        </span>
        <span>
          <i className="lg proj" /> projected finish
        </span>
        <span>
          <i className="lg target" /> target
        </span>
      </div>
    </aside>
  );
}
