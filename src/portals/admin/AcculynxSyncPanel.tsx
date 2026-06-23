// src/portals/admin/AcculynxSyncPanel.tsx
import { useEffect, useState, useCallback } from "react";

export function AcculynxSyncPanel({ adminUserId }: { adminUserId: string }) {
  const [status, setStatus] = useState<any>(null);
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    const [s, u, us] = await Promise.all([
      fetch("/api/acculynx/status").then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/acculynx/unmatched?userId=${encodeURIComponent(adminUserId)}`).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/users").then((r) => (r.ok ? r.json() : [])),
    ]);
    setStatus(s);
    setUnmatched(Array.isArray(u) ? u : []);
    setUsers(Array.isArray(us) ? us : us?.users ?? []);
  }, [adminUserId]);

  useEffect(() => { load(); }, [load]);

  async function refreshNow() {
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch("/api/acculynx/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: adminUserId, mode: "incremental" }),
      });
      if (!res.ok) {
        setActionError(`Sync failed (HTTP ${res.status}).`);
      } else {
        const r = await res.json();
        if (r?.status === "failed") setActionError(`Sync error: ${r.error ?? "unknown"}`);
      }
      await load();
    } catch (e: any) {
      setActionError(e?.message ?? "Sync request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function link(repExternalId: string, userId: string) {
    if (!userId) return;
    await fetch("/api/acculynx/link-rep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminUserId, repExternalId, userId }),
    });
    await load();
  }

  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleString() : "—");

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>AccuLynx Sync</h2>
        <button
          onClick={refreshNow}
          disabled={busy}
          style={{ padding: "8px 18px", background: busy ? "#9ca3af" : "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: busy ? "default" : "pointer", fontWeight: 600 }}
        >
          {busy ? "Syncing…" : "Refresh now"}
        </button>
      </div>

      {status && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
          {[
            ["Last status", status.lastStatus],
            ["Last sync", fmtDate(status.lastSyncAt)],
            ["Jobs processed", status.jobsProcessed ?? 0],
            ["Facts written", status.factsWritten ?? 0],
            ["Unmatched reps", status.unmatchedCount ?? unmatched.length],
          ].map(([k, v]) => (
            <div key={String(k)} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{k}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{String(v)}</div>
            </div>
          ))}
        </div>
      )}
      {actionError ? <p style={{ color: "#dc2626" }}>{actionError}</p> : null}
      {status?.lastError ? <p style={{ color: "#dc2626" }}>Last error: {status.lastError}</p> : null}

      <h3 style={{ fontSize: 16, fontWeight: 600, margin: "8px 0 12px" }}>Unmatched reps</h3>
      {unmatched.length === 0 ? (
        <p style={{ color: "#6b7280" }}>None — every rep is linked. 🎉</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {["AccuLynx rep", "Facts", "Link to Miller Storm user"].map((c) => (
                <th key={c} style={{ padding: "8px 12px", textAlign: "left", fontSize: 13 }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {unmatched.map((r) => (
              <tr key={r.repExternalId} style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "8px 12px", fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: "8px 12px" }}>{r.facts}</td>
                <td style={{ padding: "8px 12px" }}>
                  <select defaultValue="" onChange={(e) => link(r.repExternalId, e.target.value)} style={{ padding: 6, minWidth: 220 }}>
                    <option value="" disabled>Select user…</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
