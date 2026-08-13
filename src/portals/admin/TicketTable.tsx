import { useEffect, useState } from "react";
import { STATUS_LABEL, STATUS_COLOR } from "../../components/TicketButton";
import { supportTypeLabel, supportFieldLines } from "../../lib/support/categories";

type Ticket = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  type: string;
  fields?: Record<string, string>;
  note: string;
  status: "open" | "approved" | "in_progress" | "completed" | "rejected";
  adminNote?: string;
  createdAt?: string;
};

const STATUS_OPTIONS = ["open", "approved", "in_progress", "completed", "rejected"];

export function TicketTable() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [updating, setUpdating] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/tickets");
      if (res.ok) setTickets(await res.json());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const changeStatus = async (id: string, status: string) => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
      }
    } catch {} finally { setUpdating(null); }
  };

  const rows = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);

  return (
    <div style={{ background: "var(--surface-default)", border: "1px solid var(--border-default)", borderRadius: 16, padding: 24, boxShadow: "0 10px 24px rgba(15,23,42,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid var(--border-default)", fontSize: 14, background: "var(--surface-subtle)", color: "var(--text-primary)", fontWeight: 600 }}>
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading tickets…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--text-subtle)" }}>No tickets{filter !== "all" ? ` with status "${STATUS_LABEL[filter]}"` : ""}.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--surface-subtle)", textAlign: "left" }}>
                <th style={th}>User</th>
                <th style={th}>Type</th>
                <th style={th}>Details</th>
                <th style={th}>Date</th>
                <th style={th}>Status</th>
                <th style={th}>Update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const c = STATUS_COLOR[t.status] || STATUS_COLOR.open;
                return (
                  <tr key={t.id} style={{ borderTop: "1px solid var(--border-default)" }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.email}</div>
                      {t.role && <div style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "capitalize" }}>{t.role}</div>}
                    </td>
                    <td style={td}>{supportTypeLabel(t.type)}</td>
                    <td style={{ ...td, maxWidth: 320, whiteSpace: "pre-wrap" }}>
                      {supportFieldLines(t.type, t.fields).map((line) => (
                        <div key={line} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)" }}>{line}</div>
                      ))}
                      {t.note}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: 12 }}>
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td style={td}>
                      <span style={{ background: c.bg, color: c.fg, borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {STATUS_LABEL[t.status]}
                      </span>
                    </td>
                    <td style={td}>
                      <select
                        value={t.status}
                        disabled={updating === t.id}
                        onChange={(e) => changeStatus(t.id, e.target.value)}
                        style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border-default)", fontSize: 13, cursor: "pointer", background: "var(--surface-subtle)", color: "var(--text-primary)" }}
                      >
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </td>
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

const th: React.CSSProperties = { padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: "12px", verticalAlign: "top", color: "var(--text-tertiary)" };
