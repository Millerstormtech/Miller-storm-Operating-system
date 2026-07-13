import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  name: string;
  email: string;
  role: string;
  headshotUrl: string;
  suspended: boolean;
  doneLessons: number;
  totalLessons: number;
  pct: number;
  coursesCompleted: number;
  totalCourses: number;
  businessPlan: {
    revenueGoal: number | null;
    averageDealSize: number | null;
    dealsPerYear: number | null;
    dealsPerMonth: number | null;
    doorsPerDay: number | null;
    doorsPerYear: number | null;
    daysPerWeek: number | null;
    inspectionsNeeded: number | null;
    territories: string[];
    committed: boolean;
  } | null;
};

type Sales = { revenue: number; won: number; filed: number; verifiedKnocks: number; team: string };

const WINDOWS: { key: string; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/);
  if (!parts[0]) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}

function money(n: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function Avatar({ name, url }: { name: string; url: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
  ) : (
    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#eef2ff", color: "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>
      {initials(name)}
    </div>
  );
}

// Admin-panel dashboard for a single role: (1) training progress for every user
// of the role, then (2) a "Top Sales Performer" ranked list with a
// Today/Week/Month/Year filter. Stays inside /admin.
export function RoleDashboard({ role, title }: { role: string; title: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [salesWindow, setSalesWindow] = useState("month");
  const [salesByUser, setSalesByUser] = useState<Record<string, Sales>>({});

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(false);
    fetch(`/api/admin/role-dashboard?role=${encodeURIComponent(role)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => active && setRows(data.rows || []))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [role]);

  // Sales leaderboard (RepCard door knocks + AccuLynx deals) matched to each app
  // user by repUserId. Re-fetched when the time window changes.
  useEffect(() => {
    let active = true;
    fetch(`/api/leaderboard?window=${salesWindow}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!active) return;
        const map: Record<string, Sales> = {};
        for (const lb of data.leaderboard || []) {
          if (lb.repUserId) {
            map[lb.repUserId] = {
              revenue: lb.revenue || 0,
              won: lb.won || 0,
              filed: lb.filed || 0,
              verifiedKnocks: lb.verifiedKnocks || 0,
              team: lb.team || "",
            };
          }
        }
        setSalesByUser(map);
      })
      .catch(() => active && setSalesByUser({}));
    return () => {
      active = false;
    };
  }, [salesWindow]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows || [];
    return (rows || []).filter(
      (r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const stats = useMemo(() => {
    const list = rows || [];
    const n = list.length;
    const avg = n ? Math.round(list.reduce((s, r) => s + r.pct, 0) / n) : 0;
    const withPlan = list.filter((r) => r.businessPlan).length;
    const fullyDone = list.filter((r) => r.totalCourses > 0 && r.coursesCompleted === r.totalCourses).length;
    return { n, avg, withPlan, fullyDone };
  }, [rows]);

  const showPlan = useMemo(() => (rows || []).some((r) => r.businessPlan), [rows]);

  // Top sales performers: the role's users that have sales data this window,
  // ranked by revenue (then deals, then knocks).
  const performers = useMemo(() => {
    return (rows || [])
      .map((r) => ({ user: r, sales: salesByUser[r.id] }))
      .filter((x) => x.sales)
      .sort(
        (a, b) =>
          (b.sales!.revenue - a.sales!.revenue) ||
          (b.sales!.won - a.sales!.won) ||
          (b.sales!.verifiedKnocks - a.sales!.verifiedKnocks)
      );
  }, [rows, salesByUser]);

  // Users of this role that have filled a business plan.
  const plans = useMemo(() => (rows || []).filter((r) => r.businessPlan), [rows]);

  const barColor = (pct: number) => (pct >= 80 ? "#16a34a" : pct >= 40 ? "#f59e0b" : "#dc2626");
  const rankColor = (i: number) => (i === 0 ? "#d97706" : i === 1 ? "#6b7280" : i === 2 ? "#b45309" : "#9ca3af");

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: "#111827" }}>{title}</h1>
      <p style={{ margin: "0 0 20px", color: "#6b7280", fontSize: 14 }}>
        All {title.replace(/ Dashboard$/, "")} users — training progress and top sales performers.
      </p>

      {/* Stat cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Stat label="Total users" value={String(stats.n)} color="#2563eb" />
        <Stat label="Avg. course completion" value={`${stats.avg}%`} color="#16a34a" />
        <Stat label="Finished all courses" value={String(stats.fullyDone)} color="#7c3aed" />
        {showPlan && <Stat label="With business plan" value={String(stats.withPlan)} color="#f59e0b" />}
      </div>

      {/* ============ 1) COURSES / TRAINING ============ */}
      <div className="panel" style={{ marginBottom: 28 }}>
        <div className="panel-header" style={{ fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>📚 Courses — Training Progress</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", fontWeight: 400, minWidth: 200 }}
          />
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {error ? (
            <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Couldn&apos;t load. Please refresh.</div>
          ) : rows === null ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>No users found.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", textAlign: "left", color: "#6b7280", fontSize: 12.5 }}>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>User</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Courses done</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600, minWidth: 160 }}>Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} style={{ borderTop: "1px solid #f0f1f3" }}>
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={r.name} url={r.headshotUrl} />
                          <div>
                            <div style={{ fontWeight: 600, color: "#111827", display: "flex", alignItems: "center", gap: 6 }}>
                              {r.name}
                              {r.suspended && <span style={{ fontSize: 10, color: "#b91c1c", background: "#fef2f2", borderRadius: 5, padding: "1px 5px" }}>SUSPENDED</span>}
                            </div>
                            <div style={{ fontSize: 12, color: "#9ca3af" }}>{r.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "10px 16px", color: "#374151", whiteSpace: "nowrap" }}>
                        {r.coursesCompleted}/{r.totalCourses} courses
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>{r.doneLessons}/{r.totalLessons} lessons</div>
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 8, background: "#f0f1f3", borderRadius: 999, overflow: "hidden", minWidth: 80 }}>
                            <div style={{ width: `${r.pct}%`, height: "100%", background: barColor(r.pct) }} />
                          </div>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: barColor(r.pct), width: 38, textAlign: "right" }}>{r.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ============ 2) TOP SALES PERFORMER ============ */}
      <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700, color: "#111827" }}>🏆 Top Sales Performer</h2>

      {/* Today / Week / Month / Year filter */}
      <div style={{ display: "flex", gap: 4, background: "#f3f4f6", borderRadius: 8, padding: 3, width: "fit-content", marginBottom: 14 }}>
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            onClick={() => setSalesWindow(w.key)}
            style={{
              border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, borderRadius: 6, padding: "6px 14px",
              background: salesWindow === w.key ? "#fff" : "transparent",
              color: salesWindow === w.key ? "#111827" : "#6b7280",
              boxShadow: salesWindow === w.key ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {w.label}
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {performers.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>No sales data for this period.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", textAlign: "left", color: "#6b7280", fontSize: 12.5 }}>
                    <th style={{ padding: "10px 16px", fontWeight: 600, width: 60 }}>Rank</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Performer</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Team</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Revenue</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Deals won</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Knocks</th>
                  </tr>
                </thead>
                <tbody>
                  {performers.map((p, i) => (
                    <tr key={p.user.id} style={{ borderTop: "1px solid #f0f1f3" }}>
                      <td style={{ padding: "10px 16px", fontWeight: 800, fontSize: 15, color: rankColor(i) }}>
                        {i < 3 ? ["🥇", "🥈", "🥉"][i] : `#${i + 1}`}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={p.user.name} url={p.user.headshotUrl} />
                          <span style={{ fontWeight: 600, color: "#111827" }}>{p.user.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 16px", color: "#6b7280", whiteSpace: "nowrap" }}>{p.sales!.team || "—"}</td>
                      <td style={{ padding: "10px 16px", fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>{money(p.sales!.revenue)}</td>
                      <td style={{ padding: "10px 16px", color: "#374151" }}>{p.sales!.won}</td>
                      <td style={{ padding: "10px 16px", color: "#374151" }}>{p.sales!.verifiedKnocks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ============ 3) BUSINESS PLANS ============ */}
      <h2 style={{ margin: "28px 0 12px", fontSize: 18, fontWeight: 700, color: "#111827" }}>📋 Business Plans</h2>
      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {rows === null ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Loading…</div>
          ) : plans.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>No business plans yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", textAlign: "left", color: "#6b7280", fontSize: 12.5 }}>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>User</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Revenue goal</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Avg deal</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Deals/yr</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Doors/day</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Days/wk</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Territories</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((r) => {
                    const bp = r.businessPlan!;
                    return (
                      <tr key={r.id} style={{ borderTop: "1px solid #f0f1f3" }}>
                        <td style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Avatar name={r.name} url={r.headshotUrl} />
                            <div>
                              <div style={{ fontWeight: 600, color: "#111827" }}>{r.name}</div>
                              <div style={{ fontSize: 12, color: "#9ca3af" }}>{r.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "10px 16px", fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>{money(bp.revenueGoal)}</td>
                        <td style={{ padding: "10px 16px", color: "#374151", whiteSpace: "nowrap" }}>{money(bp.averageDealSize)}</td>
                        <td style={{ padding: "10px 16px", color: "#374151" }}>{bp.dealsPerYear ?? "—"}</td>
                        <td style={{ padding: "10px 16px", color: "#374151" }}>{bp.doorsPerDay ?? "—"}</td>
                        <td style={{ padding: "10px 16px", color: "#374151" }}>{bp.daysPerWeek ?? "—"}</td>
                        <td style={{ padding: "10px 16px", color: "#6b7280", maxWidth: 200 }}>
                          {bp.territories.length ? bp.territories.join(", ") : "—"}
                        </td>
                        <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 8px", background: bp.committed ? "#f0fdf4" : "#fff7ed", color: bp.committed ? "#15803d" : "#c2410c" }}>
                            {bp.committed ? "Committed" : "Draft"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 16px" }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>{value}</span>
      <span style={{ fontSize: 12.5, color: "#6b7280" }}>{label}</span>
    </div>
  );
}
