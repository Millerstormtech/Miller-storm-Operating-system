import { useEffect, useState } from "react";
import { useRouter } from "next/router";

type JoinRequest = {
  _id: string;
  userName?: string;
  userRole?: string;
  groupName?: string;
};

// Standalone page: pending "request to join" a private group. Group admins /
// system admins approve or deny here. Kept out of the StormChat page so the
// chat list stays clean.
export function JoinRequests() {
  const router = useRouter();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/storm-chat/join-requests");
      if (res.ok) setRequests(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  async function decide(requestId: string, action: "approve" | "deny") {
    setBusyId(requestId);
    try {
      const res = await fetch("/api/storm-chat/join-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      if (res.ok) setRequests(prev => prev.filter(r => r._id !== requestId));
      else alert("Couldn't update the request. Please try again.");
    } catch {
      alert("Couldn't update the request. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => router.push("/admin/storm-chat")}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px 8px 12px", background: "var(--surface-default)", color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 14 }}
        >
          <span style={{ fontSize: 17, lineHeight: 1 }}>←</span> Back
        </button>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--text-primary)", fontFamily: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif', letterSpacing: 0.2 }}>
          Join Requests
        </h1>
      </div>
      <div style={{ fontSize: 14.5, color: "var(--text-muted)", marginBottom: 20 }}>
        People asking to join private groups. Approve to add them, or deny.
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-subtle)" }}>Loading…</div>
      ) : requests.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", color: "var(--text-subtle)", background: "var(--surface-default)", border: "1px solid var(--border-default)", borderRadius: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔔</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-tertiary)" }}>No pending requests</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {requests.map(r => (
            <div key={r._id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: "var(--surface-default)", border: "1px solid var(--border-default)", borderRadius: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg, #e01418, #b30002)", color: "var(--text-inverse)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>
                {(r.userName || "?").trim().charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.userName || "A user"}
                  {r.userRole && <span style={{ fontSize: 12, color: "var(--text-subtle)", fontWeight: 500 }}> · {r.userRole}</span>}
                </div>
                <div style={{ fontSize: 13.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  wants to join “{r.groupName || "a group"}”
                </div>
              </div>
              <button type="button" disabled={busyId === r._id} onClick={() => decide(r._id, "approve")}
                style={{ padding: "9px 18px", background: "#16a34a", color: "var(--text-inverse)", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
                Approve
              </button>
              <button type="button" disabled={busyId === r._id} onClick={() => decide(r._id, "deny")}
                style={{ padding: "9px 18px", background: "var(--surface-subtle)", color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
                Deny
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
