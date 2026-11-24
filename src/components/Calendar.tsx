import type { CalEvent, GTask } from '../lib/google';

interface Props {
  events: CalEvent[] | null;
  tasks: GTask[] | null;
  signedIn: boolean;
  onConnect: () => void;
}

function dayKey(e: CalEvent): string {
  const d = e.allDay ? new Date(e.start + 'T00:00') : new Date(e.start);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function Calendar({ events, tasks, signedIn, onConnect }: Props) {
  if (!signedIn) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Calendar</h1>
        </header>
        <div className="empty">
          <p>Connect Google to see your next 7 days and your Google Tasks.</p>
          <button className="btn" onClick={onConnect}>
            Connect Google
          </button>
        </div>
      </div>
    );
  }

  const byDay = new Map<string, CalEvent[]>();
  for (const e of events ?? []) {
    const k = dayKey(e);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Calendar</h1>
        <span className="pill">Next 7 days</span>
      </header>
      <div className="cal-grid">
        <section>
          {byDay.size === 0 && <p className="muted">Nothing scheduled.</p>}
          {[...byDay.entries()].map(([day, evs]) => (
            <div key={day} className="day">
              <h3>{day}</h3>
              {evs.map((e) => (
                <div key={e.id} className="event">
                  <span className="event-time">
                    {e.allDay
                      ? 'All day'
                      : new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="event-title">{e.title}</span>
                  {e.location && <span className="muted">{e.location}</span>}
                </div>
              ))}
            </div>
          ))}
        </section>
        <section>
          <h3>Google Tasks</h3>
          {!tasks?.length && <p className="muted">No open tasks.</p>}
          {tasks?.map((t) => (
            <div key={t.id} className="event">
              <span className="event-title">{t.title}</span>
              <span className="muted">
                {t.list}
                {t.due ? ` · due ${new Date(t.due).toLocaleDateString(undefined, { timeZone: 'UTC' })}` : ''}
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
