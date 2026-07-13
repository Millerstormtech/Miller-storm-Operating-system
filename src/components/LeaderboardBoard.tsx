// src/components/LeaderboardBoard.tsx
import { useEffect, useMemo, useState, useCallback } from "react";

type Window = "day" | "week" | "month" | "year";
const WINDOWS: { key: Window; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week to Date" },
  { key: "month", label: "Month to Date" },
  { key: "year", label: "Year to Date" },
];
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n ?? 0);

// Sentinel filter values. "" = show all; "__none__" = only rows missing that field.
const ALL = "";
const NONE = "__none__";

// Column definitions drive both the header row and the click-to-sort behavior.
type SortKey = "name" | "branch" | "team" | "verifiedKnocks" | "filed" | "won" | "revenue";
type ColType = "text" | "num" | "money";
const COLUMNS: { key: SortKey; label: string; type: ColType }[] = [
  { key: "name", label: "Rep", type: "text" },
  { key: "branch", label: "Branch", type: "text" },
  { key: "team", label: "Team", type: "text" },
  { key: "verifiedKnocks", label: "Verified Door Knocks", type: "num" },
  { key: "filed", label: "Claims Filed", type: "num" },
  { key: "won", label: "Contracts", type: "num" },
  { key: "revenue", label: "Contract Amount", type: "money" },
];

export function LeaderboardBoard({ currentUserId }: { currentUserId?: string }) {
  const [window, setWindow] = useState<Window>("month");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters + sort (all applied client-side over the fetched rows).
  const [branchFilter, setBranchFilter] = useState<string>(ALL);
  const [teamFilter, setTeamFilter] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async (w: Window) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?window=${w}`);
      if (res.ok) setRows((await res.json()).leaderboard ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(window); }, [window, load]);

  // Distinct branch options (plus a "No branch" bucket if any row lacks one).
  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    let hasBlank = false;
    for (const r of rows) { if (r.branch) set.add(r.branch); else hasBlank = true; }
    return { list: Array.from(set).sort(), hasBlank };
  }, [rows]);

  // Distinct teams from RepCard's own team field (plus a "No team" bucket).
  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    let hasNone = false;
    for (const r of rows) { if (r.team) set.add(r.team); else hasNone = true; }
    return { list: Array.from(set).sort(), hasNone };
  }, [rows]);

  const visible = useMemo(() => {
    const filtered = rows.filter((r) => {
      // Branch filter
      if (branchFilter === NONE) { if (r.branch) return false; }
      else if (branchFilter && r.branch !== branchFilter) return false;
      // Team filter
      if (teamFilter === NONE) { if (r.team) return false; }
      else if (teamFilter && r.team !== teamFilter) return false;
      return true;
    });

    const col = COLUMNS.find((c) => c.key === sortKey);
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      if (col?.type === "text") {
        return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")) * dir;
      }
      return ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)) * dir;
    });
    return sorted;
  }, [rows, branchFilter, teamFilter, sortKey, sortDir]);

  // The logged-in user's own row — drives the "your rank" pop-out banner.
  // `rank` is the overall revenue rank for the selected window (from the API).
  const me = useMemo(
    () => (currentUserId ? rows.find((r) => r.repUserId === currentUserId) : undefined),
    [rows, currentUserId]
  );

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Text columns read best A→Z; number columns best high→low.
      setSortDir(COLUMNS.find((c) => c.key === key)?.type === "text" ? "asc" : "desc");
    }
  }

  const arrow = (key: SortKey) => (key === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const selectStyle = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, cursor: "pointer" } as const;

  return (
    <div>
      {/* "Your rank" pop-out — shown to any user who is on the board (sales rep,
          sales team lead, branch manager, etc.) with their own standing. */}
      {me && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
            background: "linear-gradient(135deg,#1e3a8a,#2563eb)", color: "#fff",
            borderRadius: 14, padding: "16px 20px", marginBottom: 16,
            boxShadow: "0 4px 14px rgba(37,99,235,0.35)",
          }}
        >
          <div style={{ fontSize: 34, lineHeight: 1 }}>🏆</div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }}>
              YOUR RANK · {WINDOWS.find((w) => w.key === window)?.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>
              #{me.rank}
              <span style={{ fontSize: 15, fontWeight: 600, opacity: 0.85 }}> of {rows.length}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 22, textAlign: "right" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtMoney(me.revenue)}</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Contract Amount</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{me.won ?? 0}</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Contracts</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{me.verifiedKnocks ?? 0}</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Knocks</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters — Period, Branch, Team all as matching dropdowns. */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6b7280" }}>
          Period
          <select value={window} onChange={(e) => setWindow(e.target.value as Window)} style={selectStyle}>
            {WINDOWS.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6b7280" }}>
          Branch
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} style={selectStyle}>
            <option value={ALL}>All branches</option>
            {branchOptions.list.map((b) => <option key={b} value={b}>{b}</option>)}
            {branchOptions.hasBlank ? <option value={NONE}>(No branch)</option> : null}
          </select>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6b7280" }}>
          Team
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={selectStyle}>
            <option value={ALL}>All teams</option>
            {teamOptions.list.map((t) => <option key={t} value={t}>{t}</option>)}
            {teamOptions.hasNone ? <option value={NONE}>(No team)</option> : null}
          </select>
        </label>
        {(branchFilter || teamFilter) ? (
          <button
            onClick={() => { setBranchFilter(ALL); setTeamFilter(ALL); }}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#6b7280", cursor: "pointer", fontWeight: 600 }}
          >
            Clear filters
          </button>
        ) : null}
        <span style={{ fontSize: 13, color: "#9ca3af", marginLeft: "auto" }}>
          {visible.length} rep{visible.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Legend for the flags shown next to a rep's name. */}
      <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12, color: "#6b7280", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
          RepCard only (door-knocks, no matched AccuLynx sales)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden="true">❌</span>
          Former rep (deactivated in RepCard)
        </span>
      </div>

      {loading ? (
        <p style={{ color: "#6b7280" }}>Loading leaderboard…</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                <th style={{ padding: "10px 14px", textAlign: "center", fontSize: 13, fontWeight: 600 }}>#</th>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => onSort(c.key)}
                    title="Click to sort"
                    style={{
                      padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", userSelect: "none",
                      textAlign: c.type === "text" ? "left" : "center",
                      color: c.key === sortKey ? "#2563eb" : "#374151",
                    }}
                  >
                    {c.label}{arrow(c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={COLUMNS.length + 1} style={{ textAlign: "center", padding: 20, color: "#9ca3af" }}>No data for this period yet.</td></tr>
              ) : visible.map((r, i) => {
                const isYou = currentUserId && r.repUserId === currentUserId;
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #e5e7eb", background: isYou ? "#eff6ff" : "#fff" }}>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {r.headshotUrl ? <img src={r.headshotUrl} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} /> : null}
                        {r.source === "repcard" ? (
                          <span
                            title="RepCard only (no matched AccuLynx sales)"
                            style={{ width: 9, height: 9, borderRadius: "50%", background: "#f59e0b", display: "inline-block", flexShrink: 0 }}
                          />
                        ) : null}
                        <span>{r.name}{isYou ? " (You)" : ""}</span>
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "#6b7280" }}>{r.branch || "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#6b7280" }}>{r.team || "—"}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600 }}>{r.verifiedKnocks ?? 0}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>{r.filed}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600 }}>{r.won}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#16a34a" }}>{fmtMoney(r.revenue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
