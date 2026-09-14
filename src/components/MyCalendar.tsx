// My Calendar: a Google-Calendar-style week grid of this person's events.
// Read-only — this app never creates or edits events, only draws them (see
// /api/calendar/events, and src/lib/googleCalendar/client.ts for the OAuth +
// REST access). Zero-prop, self-fetching, same shared-section shape as
// MyCertificates.tsx.
import { useEffect, useMemo, useRef, useState } from "react";

interface CalendarEventItem {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  htmlLink: string;
}

const HOUR_HEIGHT = 48; // px per hour row
const MIN_EVENT_HEIGHT = 20; // px, so a 15-minute event is still readable
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfWeek(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function hourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

type TimedEvent = CalendarEventItem & { _start: Date; _end: Date };
type LaidOutEvent = TimedEvent & { _col: number; _cols: number };

// Standard calendar overlap layout: sweep events (sorted by start) into
// clusters of transitively-overlapping events, then greedily pack each
// cluster into the fewest side-by-side columns so overlapping events share
// width instead of stacking on top of each other.
function layoutOverlaps(events: TimedEvent[]): LaidOutEvent[] {
  const sorted = [...events].sort(
    (a, b) => a._start.getTime() - b._start.getTime() || a._end.getTime() - b._end.getTime()
  );
  const out: LaidOutEvent[] = [];
  let cluster: LaidOutEvent[] = [];
  let columnEnds: number[] = [];
  let clusterMaxEnd = -Infinity;

  function flush() {
    if (!cluster.length) return;
    const cols = columnEnds.length;
    for (const e of cluster) e._cols = cols;
    out.push(...cluster);
    cluster = [];
    columnEnds = [];
    clusterMaxEnd = -Infinity;
  }

  for (const ev of sorted) {
    const start = ev._start.getTime();
    if (cluster.length && start >= clusterMaxEnd) flush();
    let col = columnEnds.findIndex((end) => end <= start);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(ev._end.getTime());
    } else {
      columnEnds[col] = ev._end.getTime();
    }
    cluster.push({ ...ev, _col: col, _cols: 0 });
    clusterMaxEnd = Math.max(clusterMaxEnd, ev._end.getTime());
  }
  flush();
  return out;
}

export function MyCalendar() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const gridRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = new Date();

  function load(ws: Date) {
    setLoadFailed(false);
    const timeMin = ws.toISOString();
    const timeMax = addDays(ws, 7).toISOString();
    fetch(`/api/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        setConnected(!!data?.connected);
        setEvents(Array.isArray(data?.events) ? data.events : []);
      })
      .catch(() => setLoadFailed(true));
  }

  useEffect(() => {
    load(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  // Land on business hours instead of midnight, once, the first time the
  // week grid actually renders.
  useEffect(() => {
    if (connected && !hasScrolled.current && gridRef.current) {
      hasScrolled.current = true;
      const anchorHour = days.some((d) => sameDay(d, today)) ? Math.max(0, today.getHours() - 1) : 7;
      gridRef.current.scrollTop = anchorHour * HOUR_HEIGHT;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

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

  // Bucket events per day-of-week column. All-day events render in a strip
  // above the grid, placed on their start day only (no multi-day spanning
  // bar — a deliberate simplification, not a gap). Timed events that cross
  // midnight are clipped to their start day so they never bleed into the
  // next column.
  const { allDayByDay, timedByDay } = useMemo(() => {
    const allDay: CalendarEventItem[][] = Array.from({ length: 7 }, () => []);
    const timed: TimedEvent[][] = Array.from({ length: 7 }, () => []);
    for (const ev of events) {
      if (ev.allDay) {
        const d = new Date(`${ev.start}T00:00:00`);
        const idx = days.findIndex((day) => sameDay(day, d));
        if (idx !== -1) allDay[idx].push(ev);
        continue;
      }
      const start = new Date(ev.start);
      const idx = days.findIndex((day) => sameDay(day, start));
      if (idx === -1) continue;
      const rawEnd = new Date(ev.end);
      const midnight = addDays(days[idx], 1);
      const end = rawEnd > midnight ? midnight : rawEnd;
      timed[idx].push({ ...ev, _start: start, _end: end });
    }
    return { allDayByDay: allDay, timedByDay: timed.map(layoutOverlaps) };
  }, [events, days]);

  const monthLabel = useMemo(() => {
    const last = days[6];
    if (weekStart.getMonth() === last.getMonth()) return `${MONTH_LABELS[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    return `${MONTH_LABELS[weekStart.getMonth()]} – ${MONTH_LABELS[last.getMonth()]} ${last.getFullYear()}`;
  }, [days, weekStart]);

  return (
    <section className="cal-card" aria-labelledby="cal-title">
      <div className="cal-top">
        <h2 id="cal-title" className="cal-title">My Calendar</h2>
        {connected ? (
          <button type="button" className="cal-textbtn" onClick={disconnect} disabled={disconnecting}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        ) : null}
      </div>

      {loadFailed ? (
        <p className="cal-note">
          Your calendar could not be loaded.{" "}
          <button type="button" className="cal-textbtn" onClick={() => load(weekStart)}>Try again</button>
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
          <div className="cal-nav">
            <div className="cal-nav-left">
              <button type="button" className="cal-navbtn" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
              <button type="button" className="cal-arrow" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">‹</button>
              <button type="button" className="cal-arrow" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">›</button>
              <span className="cal-month">{monthLabel}</span>
            </div>
          </div>

          <div className="cal-week">
            <div className="cal-week-head">
              <div className="cal-gutter" />
              {days.map((d, i) => (
                <div key={i} className="cal-day-head">
                  <span className="cal-day-name">{DAY_LABELS[i]}</span>
                  <span className={`cal-day-num${sameDay(d, today) ? " cal-day-num-today" : ""}`}>{d.getDate()}</span>
                </div>
              ))}
            </div>

            {allDayByDay.some((l) => l.length > 0) ? (
              <div className="cal-allday-row">
                <div className="cal-gutter" />
                {allDayByDay.map((list, i) => (
                  <div key={i} className="cal-allday-col">
                    {list.map((ev) => (
                      <a key={ev.id} className="cal-allday-chip" href={ev.htmlLink} target="_blank" rel="noopener noreferrer">
                        {ev.title}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="cal-grid-scroll" ref={gridRef}>
              <div className="cal-grid" style={{ height: HOUR_HEIGHT * 24 }}>
                <div className="cal-gutter cal-gutter-hours">
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="cal-hour-label" style={{ height: HOUR_HEIGHT }}>{hourLabel(h)}</div>
                  ))}
                </div>
                {days.map((d, i) => (
                  <div key={i} className="cal-day-col">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="cal-hour-line" style={{ height: HOUR_HEIGHT }} />
                    ))}
                    {timedByDay[i].map((ev) => {
                      const top = (ev._start.getHours() * 60 + ev._start.getMinutes()) / 60 * HOUR_HEIGHT;
                      const rawHeight = (ev._end.getTime() - ev._start.getTime()) / 60000 / 60 * HOUR_HEIGHT;
                      const width = 100 / ev._cols;
                      return (
                        <a
                          key={ev.id}
                          className="cal-event"
                          href={ev.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={ev.title}
                          style={{
                            top,
                            height: Math.max(MIN_EVENT_HEIGHT, rawHeight),
                            left: `${ev._col * width}%`,
                            width: `calc(${width}% - 3px)`,
                          }}
                        >
                          <span className="cal-event-title">{ev.title}</span>
                        </a>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .cal-card {
          background: var(--surface-default);
          border: 1px solid var(--border-default);
          border-radius: 18px;
          padding: 24px;
        }
        .cal-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .cal-title { margin: 0; font-size: 15px; font-weight: 800; color: var(--text-primary); }
        .cal-sub { margin: 0; font-size: 13px; color: var(--text-muted); }
        .cal-note { margin: 0; font-size: 14px; color: var(--text-muted); }
        .cal-connect { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
        .cal-connect-btn {
          display: inline-block; padding: 11px 22px; border-radius: 999px; cursor: pointer;
          background: var(--brand-on-surface); color: var(--text-inverse); text-decoration: none;
          font-size: 14px; font-weight: 700;
        }
        .cal-connect-btn:hover { opacity: 0.9; }
        .cal-textbtn {
          background: none; border: none; padding: 0; cursor: pointer;
          font-size: 13px; font-weight: 600; color: var(--brand-on-surface);
        }
        .cal-textbtn:disabled { opacity: 0.6; cursor: default; }

        .cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .cal-nav-left { display: flex; align-items: center; gap: 8px; }
        .cal-navbtn, .cal-arrow {
          background: var(--surface-muted); border: 1px solid var(--border-default); border-radius: 8px;
          cursor: pointer; color: var(--text-primary); font-size: 12.5px; font-weight: 700;
          padding: 6px 12px;
        }
        .cal-arrow { padding: 6px 10px; font-size: 15px; line-height: 1; }
        .cal-navbtn:hover, .cal-arrow:hover { background: var(--surface-subtle); border-color: var(--border-strong); }
        .cal-month { font-size: 14.5px; font-weight: 800; color: var(--text-primary); margin-left: 4px; }

        .cal-week { border: 1px solid var(--border-default); border-radius: 12px; overflow: hidden; }
        .cal-gutter { flex: 0 0 52px; }
        .cal-week-head {
          display: flex; border-bottom: 1px solid var(--border-default); background: var(--surface-default);
        }
        .cal-day-head {
          flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center;
          padding: 8px 4px; gap: 4px;
        }
        .cal-day-name { font-size: 10.5px; font-weight: 700; letter-spacing: 0.4px; color: var(--text-muted); text-transform: uppercase; }
        .cal-day-num {
          font-size: 15px; font-weight: 700; color: var(--text-primary);
          width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 999px;
        }
        .cal-day-num-today { background: var(--brand-on-surface); color: var(--text-inverse); }

        .cal-allday-row { display: flex; border-bottom: 1px solid var(--border-default); background: var(--surface-default); }
        .cal-allday-col { flex: 1 1 0; min-width: 0; padding: 4px 3px; display: flex; flex-direction: column; gap: 3px; }
        .cal-allday-chip {
          display: block; background: var(--brand-fill); color: var(--text-inverse); text-decoration: none;
          font-size: 11px; font-weight: 700; padding: 3px 6px; border-radius: 5px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .cal-grid-scroll { max-height: 480px; overflow-y: auto; overflow-x: auto; }
        .cal-grid { display: flex; min-width: 640px; position: relative; }
        .cal-gutter-hours { display: flex; flex-direction: column; }
        .cal-hour-label {
          font-size: 10.5px; color: var(--text-muted); text-align: right; padding-right: 8px;
          box-sizing: border-box; transform: translateY(-6px);
        }
        .cal-day-col { flex: 1 1 0; min-width: 0; position: relative; border-left: 1px solid var(--border-default); }
        .cal-hour-line { border-bottom: 1px solid var(--border-default); box-sizing: border-box; }
        .cal-event {
          position: absolute; display: block; overflow: hidden; border-radius: 5px;
          background: var(--brand-fill); color: var(--text-inverse); text-decoration: none;
          padding: 2px 5px; box-sizing: border-box; border: 1px solid var(--surface-default);
        }
        .cal-event-title { font-size: 11px; font-weight: 700; line-height: 1.3; }
        .cal-event:hover { opacity: 0.9; }
      `}</style>
    </section>
  );
}
