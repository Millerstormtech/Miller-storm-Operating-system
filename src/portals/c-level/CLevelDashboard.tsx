import { useEffect, useState } from "react";

type LbRow = {
  rank: number;
  name: string;
  branch?: string;
  verifiedKnocks?: number;
  revenue?: number;
  won?: number;
  filed?: number;
  headshotUrl?: string;
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 20,
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: "#111827", marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function CLevelDashboard() {
  const [rows, setRows] = useState<LbRow[]>([]);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [managerCount, setManagerCount] = useState<number | null>(null);
  const [courseCount, setCourseCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [lbRes, usersRes, coursesRes] = await Promise.all([
          fetch(`/api/leaderboard?window=month`),
          fetch(`/api/users`),
          fetch(`/api/courses?summary=true`),
        ]);
        if (lbRes.ok && mounted) {
          const data = await lbRes.json();
          setRows(data.leaderboard || []);
        }
        if (usersRes.ok && mounted) {
          const users = await usersRes.json();
          const list = Array.isArray(users) ? users : [];
          setUserCount(list.filter((u: any) => !u.deleted && !u.suspended).length);
          setManagerCount(list.filter((u: any) => u.role === "manager" && !u.deleted).length);
        }
        if (coursesRes.ok && mounted) {
          const courses = await coursesRes.json();
          const list = Array.isArray(courses) ? courses : [];
          setCourseCount(list.filter((c: any) => c.status === "published").length);
        }
      } catch (e) {
        console.error("C-Level dashboard load failed:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
  const totalKnocks = rows.reduce((s, r) => s + (r.verifiedKnocks || 0), 0);
  const totalWon = rows.reduce((s, r) => s + (r.won || 0), 0);
  const activeReps = rows.length;
  const top = rows.slice(0, 10);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800, color: "#111827" }}>C-Level Dashboard</h1>
      <p style={{ margin: "0 0 24px", color: "#6b7280", fontSize: 14 }}>
        Company-wide overview · this month · live from AccuLynx + RepCard
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
        <StatCard label="Revenue (MTD)" value={loading ? "…" : money(totalRevenue)} sub={`${activeReps} active reps`} />
        <StatCard label="Verified Knocks" value={loading ? "…" : totalKnocks.toLocaleString()} sub="this month" />
        <StatCard label="Deals Won" value={loading ? "…" : totalWon.toLocaleString()} sub="this month" />
        <StatCard label="Active Users" value={loading || userCount === null ? "…" : userCount.toLocaleString()} sub={managerCount !== null ? `${managerCount} managers` : undefined} />
        <StatCard label="Published Courses" value={loading || courseCount === null ? "…" : String(courseCount)} sub="training library" />
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: 15 }}>
          Top Performers · this month
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Loading…</div>
        ) : top.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>No leaderboard data yet.</div>
        ) : (
          <div>
            {top.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: i < top.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                <div style={{ width: 26, textAlign: "center", fontWeight: 800, color: i < 3 ? "#CB0002" : "#9ca3af" }}>{r.rank}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  {r.branch && <div style={{ fontSize: 12, color: "#9ca3af" }}>{r.branch}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, color: "#111827" }}>{money(r.revenue || 0)}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>{(r.verifiedKnocks || 0).toLocaleString()} knocks</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
