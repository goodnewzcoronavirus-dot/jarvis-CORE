import type { Email } from '../lib/google';

interface Props {
  emails: Email[] | null;
  signedIn: boolean;
  onConnect: () => void;
}

function fromName(from: string): string {
  const m = from.match(/^"?([^"<]+)"?\s*</);
  return (m ? m[1] : from).trim();
}

export function Inbox({ emails, signedIn, onConnect }: Props) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Inbox</h1>
        {emails && <span className="pill">{emails.filter((e) => e.unread).length} unread</span>}
      </header>
      {!signedIn ? (
        <div className="empty">
          <p>Connect Google to see your Gmail here.</p>
          <button className="btn" onClick={onConnect}>
            Connect Google
          </button>
        </div>
      ) : !emails ? (
        <div className="empty">
          <p>Loading…</p>
        </div>
      ) : (
        <ul className="list">
          {emails.map((e) => (
            <li key={e.id} className={`row ${e.unread ? 'unread' : ''}`}>
              <a href={`https://mail.google.com/mail/u/0/#inbox/${e.id}`} target="_blank" rel="noreferrer">
                <div className="row-top">
                  <span className="row-from">{fromName(e.from)}</span>
                  <span className="row-date">{new Date(e.date).toLocaleDateString()}</span>
                </div>
                <div className="row-subject">{e.subject}</div>
                <div className="row-snippet">{e.snippet}</div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
