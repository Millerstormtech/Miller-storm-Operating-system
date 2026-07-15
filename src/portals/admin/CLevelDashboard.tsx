import { useEffect, useMemo, useState } from "react";
import { DevWarningBanner } from "../../components/DevWarningBanner";

type LbRow = {
  rank: number;
  id: string;
  name: string;
  branch: string | null;
  team: string | null;
  verifiedKnocks: number;
  filed: number;
  won: number;
  revenue: number;
  repUserId: string | null;
  headshotUrl: string;
};

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

function money(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

// C-Level executive view: company-wide Top 10 performers for the selected time
// window (default month), ranked by revenue. Everyone's sales data (branch
// managers + sales reps) flows through the shared sales leaderboard.
export function CLevelDashboard() {
  const [rows, setRows] = useState<LbRow[] | null>(null);
  const [error, setError] = useState(false);
  const [salesWindow, setSalesWindow] = useState("month");

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(false);
    fetch(`/api/leaderboard?window=${salesWindow}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => active && setRows(data.leaderboard || []))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [salesWindow]);

  const top10 = useMemo(() => (rows || []).slice(0, 10), [rows]);

  const totals = useMemo(() => {
    const all = rows || [];
    return {
      reps: all.length,
      revenue: all.reduce((s, r) => s + (r.revenue || 0), 0),
      won: all.reduce((s, r) => s + (r.won || 0), 0),
      knocks: all.reduce((s, r) => s + (r.verifiedKnocks || 0), 0),
    };
  }, [rows]);

  const rankColor = (rank: number) =>
    rank === 1 ? "#d97706" : rank === 2 ? "#6b7280" : rank === 3 ? "#b45309" : "#9ca3af";

  return (
    <div style={{ padding: 24 }}>
      <DevWarningBanner />
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: "#111827" }}>C-Level Dashboard</h1>
      <p style={{ margin: "0 0 20px", color: "#6b7280", fontSize: 14 }}>
        Company-wide Top 10 performers ({salesWindow}) across all branch managers and sales reps, ranked by revenue.
      </p>

      {/* Company totals */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Stat label="Active reps" value={String(totals.reps)} color="#2563eb" />
        <Stat label={`Total revenue (${salesWindow})`} value={money(totals.revenue)} color="#0891b2" />
        <Stat label="Deals won" value={String(totals.won)} color="#16a34a" />
        <Stat label="Verified knocks" value={String(totals.knocks)} color="#7c3aed" />
      </div>

      {/* Window toggle */}
      <div style={{ display: "flex", gap: 4, background: "#f3f4f6", borderRadius: 8, padding: 3, width: "fit-content", marginBottom: 18 }}>
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
        <div className="panel-header" style={{ fontWeight: 700 }}>🏆 Top Sales Performer — Top 10 ({WINDOWS.find((w) => w.key === salesWindow)?.label})</div>
        <div className="panel-body" style={{ padding: 0 }}>
          {error ? (
            <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Couldn&apos;t load the leaderboard. Please refresh.</div>
          ) : rows === null ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Loading…</div>
          ) : top10.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>No sales data for this period.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", textAlign: "left", color: "#6b7280", fontSize: 12.5 }}>
                    <th style={{ padding: "10px 16px", fontWeight: 600, width: 60 }}>Rank</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Rep</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Branch / Team</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Revenue</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Deals won</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Filed</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600 }}>Knocks</th>
                  </tr>
                </thead>
                <tbody>
                  {top10.map((r) => (
                    <tr key={r.id} style={{ borderTop: "1px solid #f0f1f3" }}>
                      <td style={{ padding: "10px 16px", fontWeight: 800, fontSize: 16, color: rankColor(r.rank) }}>
                        {r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : `#${r.rank}`}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {r.headshotUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.headshotUrl} alt={r.name} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#eef2ff", color: "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>
                              {initials(r.name)}
                            </div>
                          )}
                          <span style={{ fontWeight: 600, color: "#111827" }}>{r.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 16px", color: "#6b7280", whiteSpace: "nowrap" }}>
                        {r.branch || "—"}{r.team ? ` · ${r.team}` : ""}
                      </td>
                      <td style={{ padding: "10px 16px", fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>{money(r.revenue || 0)}</td>
                      <td style={{ padding: "10px 16px", color: "#374151" }}>{r.won || 0}</td>
                      <td style={{ padding: "10px 16px", color: "#374151" }}>{r.filed || 0}</td>
                      <td style={{ padding: "10px 16px", color: "#374151" }}>{r.verifiedKnocks || 0}</td>
                    </tr>
                  ))}
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
