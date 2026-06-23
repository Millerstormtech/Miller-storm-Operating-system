import type { NextPage } from "next";
import { useEffect, useState, useCallback } from "react";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";

const statusColor: Record<string, string> = {
  processed: "#16a34a", duplicate: "#d97706", failed: "#dc2626",
};
const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n ?? 0);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const LeaderboardPage: NextPage = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/integration-events");
      if (res.ok) setEvents(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { 
    load(); 
    // Auto-refresh every 30 seconds to keep it "live"
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const inspections = events.filter(e => {
     const type = (e.eventType || "").toLowerCase();
     const milestone = (e.milestoneName || "").toLowerCase();
     return type.includes("inspection") || milestone.includes("inspection") || type.includes("milestone") && milestone.includes("inspection");
  });
  const claims = events.filter(e => {
     const type = (e.eventType || "").toLowerCase();
     const milestone = (e.milestoneName || "").toLowerCase();
     const isClaim = type.includes("claim") || type.includes("approved") || milestone.includes("claim") || milestone.includes("approved");
     return isClaim;
  });

  const cols = ["#", "Rep Name", "Job Number", "Amount", "Date", "Location", "Status"];

  function EventTable({ rows, type }: { rows: any[]; type: "inspection" | "claim" }) {
    return (
      <div style={{ overflowX: "auto", marginBottom: 32 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {cols.map(c => <th key={c} style={th}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 16, color: "#9ca3af" }}>No data yet</td></tr>
            ) : rows.map((e, i) => (
              <tr key={e._id} style={{ borderBottom: "1px solid #e2e8f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={td}>{i + 1}</td>
                <td style={{ ...td, fontWeight: 600 }}>{e.repName}</td>
                <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{e.externalEventId}</td>
                <td style={{ ...td, fontWeight: 600, color: type === "claim" ? "#16a34a" : "#374151" }}>{e.revenue ? fmt(e.revenue) : "—"}</td>
                <td style={td}>{fmtDate(e.eventDate)}</td>
                <td style={td}>
                  <span style={{ padding: "2px 8px", borderRadius: 12, background: type === "claim" ? "#dcfce7" : "#dbeafe", color: type === "claim" ? "#15803d" : "#1d4ed8", fontSize: 12, fontWeight: 600 }}>
                    {e.location || "—"}
                  </span>
                </td>
                <td style={td}><span style={{ color: statusColor[e.status] ?? "#555", fontWeight: 600 }}>{e.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <AdminPageWrapper currentView="leaderboard">
      <div style={{ padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Sales Leaderboard</h1>
          <button onClick={load} style={{ padding: "8px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>Refresh</button>
        </div>

        {loading ? <p>Loading...</p> : (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Inspections</h2>
            <EventTable rows={inspections} type="inspection" />

            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Claims</h2>
            <EventTable rows={claims} type="claim" />

            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>All Events Log</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    {["Time", "Rep Name", "Event Type", "Job Number", "Amount", "Location", "Status"].map(c => <th key={c} style={th}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 16, color: "#9ca3af" }}>No events yet</td></tr>
                  ) : events.map((e) => (
                    <tr key={e._id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={td}>{new Date(e.createdAt).toLocaleString()}</td>
                      <td style={td}>{e.repName}</td>
                      <td style={td}>{e.eventType}</td>
                      <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{e.externalEventId}</td>
                      <td style={td}>{e.revenue ? fmt(e.revenue) : "—"}</td>
                      <td style={td}>{e.location || "—"}</td>
                      <td style={td}><span style={{ color: statusColor[e.status] ?? "#555", fontWeight: 600 }}>{e.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AdminPageWrapper>
  );
};

const th: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "10px 14px", fontSize: 13 };

export default LeaderboardPage;
