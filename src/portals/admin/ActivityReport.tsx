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

const th: React.CSSProperties = { padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.3, textAlign: "center", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14, color: "var(--text-primary)", textAlign: "center", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderTop: "1px solid var(--border-default)" };

const dth: React.CSSProperties = { padding: "6px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)", textAlign: "right", whiteSpace: "nowrap" };
const dtd: React.CSSProperties = { padding: "6px 10px", fontSize: 13, color: "var(--text-muted)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderTop: "1px solid var(--border-default)" };

// A rep's videos + quizzes as a table, grouped by course: a full-width course
// header row, then a Videos section and a Quizzes section, each item a row with
// its Web / App / Total time.
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
  const groups = [...courses.values()].sort((a, b) => b.total - a.total);
  const byTime = (a: LessonTime, b: LessonTime) => (b.secondsWeb + b.secondsMobile) - (a.secondsWeb + a.secondsMobile);

  const itemRow = (item: LessonTime, untitled: string) => (
    <tr key={item.pageId}>
      <td style={{ ...dtd, textAlign: "left", color: "var(--text-primary)", paddingLeft: 22, overflowWrap: "anywhere", whiteSpace: "normal" }}>{item.title || untitled}</td>
      <td style={dtd}>{fmt(item.secondsWeb)}</td>
      <td style={dtd}>{fmt(item.secondsMobile)}</td>
      <td style={{ ...dtd, color: "var(--text-primary)", fontWeight: 700 }}>{fmt(item.secondsWeb + item.secondsMobile)}</td>
    </tr>
  );
  const sectionRow = (label: string) => (
    <tr><td colSpan={4} style={{ ...dtd, textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)", paddingTop: 8 }}>{label}</td></tr>
  );

  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border-default)", borderRadius: 10, margin: "8px 0 2px", background: "var(--surface-default)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
        <thead>
          <tr>
            <th style={{ ...dth, textAlign: "left" }}>Lesson</th>
            <th style={{ ...dth, width: 90 }}>Web</th>
            <th style={{ ...dth, width: 90 }}>App</th>
            <th style={{ ...dth, width: 80 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <Fragment key={i}>
              <tr>
                <td colSpan={4} style={{ ...dtd, textAlign: "left", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", background: "var(--surface-subtle)" }}>{g.title}</td>
              </tr>
              {g.videos.length > 0 && sectionRow("Videos")}
              {[...g.videos].sort(byTime).map((v) => itemRow(v, "Untitled video"))}
              {g.quizzes.length > 0 && sectionRow("Quizzes")}
              {[...g.quizzes].sort(byTime).map((q) => itemRow(q, "Untitled quiz"))}
            </Fragment>
          ))}
        </tbody>
      </table>
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
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-default)", fontSize: 14, background: "var(--surface-default)", color: "var(--text-primary)", colorScheme: "light dark" }} />
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
                <th style={th}>Web</th>
                <th style={th}>App - Mobile</th>
                <th style={th}>Total</th>
                <th style={th}>Video</th>
                <th style={th}>Quiz</th>
                <th style={th}>Detail</th>
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
