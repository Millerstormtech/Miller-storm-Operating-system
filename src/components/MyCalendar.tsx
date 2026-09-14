// My Calendar: this person's upcoming Google Calendar events, next 30 days.
// Read-only — this app never creates or edits events, only draws them (see
// /api/calendar/events, and src/lib/googleCalendar/client.ts for the OAuth +
// REST access). Same shape as MyCertificates.tsx: a zero-prop, self-fetching
// section shared by every role's page.
import { useEffect, useState } from "react";

interface CalendarEventItem {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  htmlLink: string;
}

function fmtEventTime(ev: CalendarEventItem): string {
  if (ev.allDay) {
    return `${new Date(`${ev.start}T00:00:00`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })} · All day`;
  }
  const start = new Date(ev.start);
  const dateLabel = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeLabel = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dateLabel} · ${timeLabel}`;
}

export function MyCalendar() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  function load() {
    setLoadFailed(false);
    fetch("/api/calendar/events")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        setConnected(!!data?.connected);
        setEvents(Array.isArray(data?.events) ? data.events : []);
      })
      .catch(() => setLoadFailed(true));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/calendar/disconnect", { method: "POST" });
      setConnected(false);
      setEvents([]);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <section className="cal-card" aria-labelledby="cal-title">
      <h2 id="cal-title" className="cal-title">My Calendar</h2>

      {loadFailed ? (
        <p className="cal-note">
          Your calendar could not be loaded.{" "}
          <button type="button" className="cal-textbtn" onClick={load}>Try again</button>
        </p>
      ) : connected === null ? (
        <p className="cal-note">Loading…</p>
      ) : !connected ? (
        <div className="cal-connect">
          <p className="cal-sub">Connect your Google Calendar to see your upcoming events here.</p>
          <a className="cal-connect-btn" href="/api/calendar/connect">Connect Google Calendar</a>
        </div>
      ) : (
        <>
          <div className="cal-head-row">
            <p className="cal-sub">Next 30 days</p>
            <button type="button" className="cal-textbtn" onClick={disconnect} disabled={disconnecting}>
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
          {events.length === 0 ? (
            <p className="cal-note">No upcoming events in the next 30 days.</p>
          ) : (
            <ul className="cal-list">
              {events.map((ev) => (
                <li key={ev.id} className="cal-row">
                  <div className="cal-text">
                    <span className="cal-name">{ev.title}</span>
                    <span className="cal-meta">
                      {fmtEventTime(ev)}
                      {ev.location ? ` · ${ev.location}` : ""}
                    </span>
                  </div>
                  <a className="cal-open" href={ev.htmlLink} target="_blank" rel="noopener noreferrer">
                    Open
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <style jsx>{`
        .cal-card {
          background: var(--surface-default);
          border: 1px solid var(--border-default);
          border-radius: 18px;
          padding: 24px;
          max-width: 720px;
        }
        .cal-title { margin: 0 0 14px; font-size: 15px; font-weight: 800; color: var(--text-primary); }
        .cal-sub { margin: 0; font-size: 13px; color: var(--text-muted); }
        .cal-note { margin: 0; font-size: 14px; color: var(--text-muted); }
        .cal-connect { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
        .cal-connect-btn {
          display: inline-block; padding: 11px 22px; border-radius: 999px; cursor: pointer;
          background: var(--brand-on-surface); color: var(--text-inverse); text-decoration: none;
          font-size: 14px; font-weight: 700;
        }
        .cal-connect-btn:hover { opacity: 0.9; }
        .cal-head-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
        .cal-textbtn {
          background: none; border: none; padding: 0; cursor: pointer;
          font-size: 13px; font-weight: 600; color: var(--brand-on-surface);
        }
        .cal-textbtn:disabled { opacity: 0.6; cursor: default; }
        .cal-list { list-style: none; margin: 10px 0 0; padding: 0; }
        .cal-row {
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
          gap: 8px 16px; padding: 14px 0; border-top: 1px solid var(--border-default);
        }
        .cal-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 260px; }
        .cal-name { font-size: 15px; font-weight: 700; color: var(--text-primary); overflow-wrap: anywhere; }
        .cal-meta { font-size: 12.5px; color: var(--text-muted); }
        .cal-open {
          flex-shrink: 0; padding: 8px 16px; border-radius: 999px; cursor: pointer; text-decoration: none;
          background: var(--surface-muted); color: var(--text-primary);
          border: 1px solid var(--border-default); font-size: 13px; font-weight: 700;
          transition: background 0.15s, border-color 0.15s;
        }
        .cal-open:hover { background: var(--surface-subtle); border-color: var(--border-strong); }
      `}</style>
    </section>
  );
}
