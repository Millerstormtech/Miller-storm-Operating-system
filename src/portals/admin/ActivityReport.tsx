import { Fragment, useEffect, useState, useCallback } from "react";

// Admin view of daily rep activity: how long each rep spent on the app (web vs
// mobile), how much of that was watching training videos or taking quizzes, and
// which videos they watched. Reads /api/activity/report (admin only).

type LessonTime = { courseId: string; courseTitle: string; pageId: string; title: string; secondsWeb: number; secondsMobile: number };
type Rep = {
  userId: string;
  name: string;
  email: string;
  role: string;
  appSecondsWeb: number;
  appSecondsMobile: number;
  videoSecondsWeb: number;
  videoSecondsMobile: number;
  quizSecondsWeb: number;
  quizSecondsMobile: number;
  videos: LessonTime[];
  quizzes: LessonTime[];
};

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function todayUtc(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", "c-level": "C-Level", "branch-manager": "Branch Manager",
  "sales-team-lead": "Team Lead", sales: "Sales", marketing: "Marketing",
};

const th: React.CSSProperties = { padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14, color: "var(--text-primary)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderTop: "1px solid var(--border-default)" };

// One row: a video/quiz name + its Web time, App time, and total.
function LessonRow({ name, secondsWeb, secondsMobile }: { name: string; secondsWeb: number; secondsMobile: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, fontSize: 13, padding: "1px 0" }}>
      <span style={{ color: "var(--text-primary)", flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{name}</span>
      <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", flex: "none", width: 92, textAlign: "right" }}>Web {fmt(secondsWeb)}</span>
      <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", flex: "none", width: 92, textAlign: "right" }}>App {fmt(secondsMobile)}</span>
      <span style={{ color: "var(--text-primary)", fontWeight: 700, fontVariantNumeric: "tabular-nums", flex: "none", width: 72, textAlign: "right" }}>{fmt(secondsWeb + secondsMobile)}</span>
    </div>
  );
}

// Group a rep's videos + quizzes under the course each belongs to. Per course:
// the course name, then its videos, then its quizzes.
function CourseGroups({ videos, quizzes }: { videos: LessonTime[]; quizzes: LessonTime[] }) {
  const courses = new Map<string, { title: string; videos: LessonTime[]; quizzes: LessonTime[]; total: number }>();
  const bucket = (item: LessonTime, kind: "videos" | "quizzes") => {
    const key = item.courseId || "__none__";
    const g = courses.get(key) || { title: item.courseTitle || "Other", videos: [], quizzes: [], total: 0 };
    g[kind].push(item);
    g.total += item.secondsWeb + item.secondsMobile;
    courses.set(key, g);
  };
  videos.forEach((v) => bucket(v, "videos"));
  quizzes.forEach((q) => bucket(q, "quizzes"));
  // Busiest course first; within a course, busiest item first.
  const groups = [...courses.values()].sort((a, b) => b.total - a.total);
  const byTime = (a: LessonTime, b: LessonTime) => (b.secondsWeb + b.secondsMobile) - (a.secondsWeb + a.secondsMobile);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "10px 0 2px" }}>
      {groups.map((g, i) => (
        <div key={i}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6, paddingBottom: 4, borderBottom: "1px solid var(--border-default)" }}>
            {g.title}
          </div>
          {g.videos.length > 0 && (
            <div style={{ marginBottom: g.quizzes.length ? 8 : 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)", margin: "2px 0 3px" }}>Videos</div>
              {[...g.videos].sort(byTime).map((v) => <LessonRow key={v.pageId} name={v.title || "Untitled video"} secondsWeb={v.secondsWeb} secondsMobile={v.secondsMobile} />)}
            </div>
          )}
          {g.quizzes.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)", margin: "2px 0 3px" }}>Quizzes</div>
              {[...g.quizzes].sort(byTime).map((q) => <LessonRow key={q.pageId} name={q.title || "Untitled quiz"} secondsWeb={q.secondsWeb} secondsMobile={q.secondsMobile} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ActivityReport() {
  const [date, setDate] = useState(todayUtc());
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true); setFailed(false);
    try {
      const res = await fetch(`/api/activity/report?date=${encodeURIComponent(d)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setReps(Array.isArray(data.reps) ? data.reps : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const totalApp = reps.reduce((n, r) => n + r.appSecondsWeb + r.appSecondsMobile, 0);
  const totalVideo = reps.reduce((n, r) => n + r.videoSecondsWeb + r.videoSecondsMobile, 0);

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text-primary)" }}>
          <span style={{ fontWeight: 600 }}>Day</span>
          <input type="date" value={date} max={todayUtc()} onChange={(e) => setDate(e.target.value || todayUtc())}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-default)", fontSize: 14, background: "var(--surface-default)", color: "var(--text-primary)" }} />
        </label>
        <button type="button" onClick={() => load(date)}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-subtle)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-primary)" }}>
          Refresh
        </button>
        {!loading && !failed && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)" }}>
            <span><strong style={{ color: "var(--text-primary)" }}>{reps.length}</strong> active reps</span>
            <span>App: <strong style={{ color: "var(--text-primary)" }}>{fmt(totalApp)}</strong></span>
            <span>Video: <strong style={{ color: "var(--text-primary)" }}>{fmt(totalVideo)}</strong></span>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
      ) : failed ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Couldn&rsquo;t load activity. Refresh to try again.</div>
      ) : reps.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No app activity recorded on this day yet.</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border-default)", borderRadius: 12 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 820 }}>
            <thead>
              <tr style={{ background: "var(--surface-subtle)" }}>
                <th style={{ ...th, textAlign: "left" }}>Rep</th>
                <th style={th}>App · Web</th>
                <th style={th}>App · Mobile</th>
                <th style={th}>App · Total</th>
                <th style={th}>Video</th>
                <th style={th}>Quiz</th>
                <th style={{ ...th, textAlign: "center" }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((r) => {
                const appTotal = r.appSecondsWeb + r.appSecondsMobile;
                const video = r.videoSecondsWeb + r.videoSecondsMobile;
                const quiz = r.quizSecondsWeb + r.quizSecondsMobile;
                const isOpen = openId === r.userId;
                return (
                  <Fragment key={r.userId}>
                    <tr>
                      <td style={{ ...td, textAlign: "left" }}>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{ROLE_LABEL[r.role] || r.role}</div>
                      </td>
                      <td style={td}>{fmt(r.appSecondsWeb)}</td>
                      <td style={td}>{fmt(r.appSecondsMobile)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{fmt(appTotal)}</td>
                      <td style={td}>{fmt(video)}</td>
                      <td style={td}>{fmt(quiz)}</td>
                      <td style={{ ...td, textAlign: "center" }}>
                        {(r.videos.length + r.quizzes.length) > 0 ? (
                          <button type="button" onClick={() => setOpenId(isOpen ? null : r.userId)}
                            style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border-default)", background: isOpen ? "var(--brand-fill)" : "var(--surface-subtle)", color: isOpen ? "var(--text-inverse)" : "var(--text-primary)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            {r.videos.length + r.quizzes.length} {isOpen ? "▾" : "▸"}
                          </button>
                        ) : (
                          <span style={{ color: "var(--text-subtle)" }}>–</span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (r.videos.length + r.quizzes.length) > 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: "4px 12px 14px", background: "var(--surface-subtle)" }}>
                          <CourseGroups videos={r.videos} quizzes={r.quizzes} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 14, fontSize: 12, color: "var(--text-subtle)", lineHeight: 1.5 }}>
        Times are how long the app/site was open and focused (UTC day). Video and Quiz are the
        portion of that spent on a training video or quiz. This tracks only Miller Storm app usage — nothing else on the device.
      </p>
    </div>
  );
}
