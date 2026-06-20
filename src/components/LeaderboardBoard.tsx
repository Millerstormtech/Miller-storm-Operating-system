// src/components/LeaderboardBoard.tsx
import { useEffect, useState, useCallback } from "react";

type Window = "week" | "month" | "year";
const WINDOWS: { key: Window; label: string }[] = [
  { key: "week", label: "Week to Date" },
  { key: "month", label: "Month to Date" },
  { key: "year", label: "Year to Date" },
];
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n ?? 0);

export function LeaderboardBoard({ currentUserId }: { currentUserId?: string }) {
  const [window, setWindow] = useState<Window>("month");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            onClick={() => setWindow(w.key)}
            style={{
              padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600,
              border: "1px solid " + (window === w.key ? "#2563eb" : "#d1d5db"),
              background: window === w.key ? "#2563eb" : "#fff",
              color: window === w.key ? "#fff" : "#374151",
            }}
          >
            {w.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "#6b7280" }}>Loading leaderboard…</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                {["#", "Rep", "Branch", "Claims Filed", "Deals Won", "Revenue"].map((c) => (
                  <th key={c} style={{ padding: "10px 14px", textAlign: c === "Rep" || c === "Branch" ? "left" : "center", fontSize: 13, fontWeight: 600 }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 20, color: "#9ca3af" }}>No data for this period yet.</td></tr>
              ) : rows.map((r) => {
                const isYou = currentUserId && r.repUserId === currentUserId;
                return (
                  <tr key={r.repExternalId} style={{ borderBottom: "1px solid #e5e7eb", background: isYou ? "#eff6ff" : "#fff" }}>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700 }}>{r.rank}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                      {r.name}{isYou ? " (You)" : ""}
                      {!r.linked && (
                        <span title="Not linked to a Miller Storm user" style={{ marginLeft: 6, fontSize: 11, color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: 8 }}>
                          unlinked
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#6b7280" }}>{r.branch}</td>
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
