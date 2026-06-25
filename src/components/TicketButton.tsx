import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";

type Ticket = {
  id: string;
  name: string;
  email: string;
  type: "bug" | "feature" | "other";
  note: string;
  status: "open" | "approved" | "in_progress" | "completed" | "rejected";
  adminNote?: string;
  createdAt?: string;
};

const TYPE_LABEL: Record<string, string> = {
  bug: "Bug / Issue Fix",
  feature: "Request New Feature",
  other: "Other",
};

export const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  approved: "Approved",
  in_progress: "In Progress",
  completed: "Completed",
  rejected: "Rejected",
};

export const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  open: { bg: "#dbeafe", fg: "#1e40af" },        // light blue
  approved: { bg: "#15803d", fg: "#ffffff" },     // dark green
  in_progress: { bg: "#dcfce7", fg: "#166534" },  // light green
  completed: { bg: "#fee2e2", fg: "#b91c1c" },    // light red
  rejected: { bg: "#dc2626", fg: "#ffffff" },     // red
};

export function TicketButton() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  // ── Admin: red "Tickets" button that shakes when open tickets exist ─────────
  const [openCount, setOpenCount] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/tickets?summary=1");
        if (res.ok && active) {
          const data = await res.json();
          setOpenCount(data.openCount || 0);
        }
      } catch {}
    };
    poll();
    const t = setInterval(poll, 20000);
    return () => { active = false; clearInterval(t); };
  }, [isAdmin]);

  // ── User: modal with form + own ticket list ─────────────────────────────────
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<"bug" | "feature" | "other">("bug");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [toast, setToast] = useState("");

  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets");
      if (res.ok) setTickets(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (open) {
      setName(user?.name || "");
      setEmail(user?.email || "");
      loadTickets();
    }
  }, [open, user, loadTickets]);

  const submit = async () => {
    if (!name.trim() || !email.trim() || !note.trim()) {
      setToast("Please fill name, email and details.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, type, note }),
      });
      if (res.ok) {
        setNote("");
        setToast("✅ Ticket sent to admin!");
        loadTickets();
        setTimeout(() => setToast(""), 3000);
      } else {
        setToast("Something went wrong. Try again.");
      }
    } catch {
      setToast("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  if (isAdmin) {
    return (
      <>
        <style>{`@keyframes ticketShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-3px)}40%,80%{transform:translateX(3px)}}`}</style>
        <button
          type="button"
          onClick={() => router.push("/admin/tickets")}
          title="View tickets"
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
            lineHeight: 1,
            background: "#dc2626",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "9px 16px",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            marginRight: 8,
            animation: openCount > 0 ? "ticketShake 0.6s ease-in-out infinite" : "none",
          }}
        >
          🎫 Tickets
          {openCount > 0 && (
            <span style={{
              position: "absolute", top: -6, right: -6, background: "#111827", color: "#fff",
              borderRadius: 999, minWidth: 20, height: 20, fontSize: 11, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px",
            }}>{openCount > 99 ? "99+" : openCount}</span>
          )}
        </button>
      </>
    );
  }

  // Sales / Manager / Marketing
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Raise a support ticket"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", lineHeight: 1,
          background: "#bbf7d0", color: "#065f46", border: "1px solid #86efac",
          borderRadius: 6, padding: "9px 16px", fontWeight: 700, fontSize: 14,
          cursor: "pointer", marginRight: 8,
        }}
      >
        🎫 Raise a Ticket
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "40px 16px" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 14, maxWidth: 520, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
          >
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>🎫 Raise a Ticket</h2>
              <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6b7280" }}>×</button>
            </div>

            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={lbl}>What's your name?
                <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Your name" />
              </label>
              <label style={lbl}>Email
                <input value={email} onChange={(e) => setEmail(e.target.value)} style={inp} placeholder="you@example.com" />
              </label>
              <label style={lbl}>Reason
                <select value={type} onChange={(e) => setType(e.target.value as any)} style={inp}>
                  <option value="bug">Bug / Issue Fix</option>
                  <option value="feature">Request New Feature</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label style={lbl}>Note
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} style={{ ...inp, resize: "vertical" }} placeholder="Describe the issue or request..." />
              </label>

              {toast && <div style={{ fontSize: 13, color: toast.startsWith("✅") ? "#166534" : "#b91c1c", fontWeight: 600 }}>{toast}</div>}

              <button type="button" onClick={submit} disabled={submitting}
                style={{ background: "#111827", color: "#fff", border: "none", borderRadius: 999, padding: "12px", fontWeight: 700, fontSize: 15, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1 }}>
                {submitting ? "Sending..." : "Send to Admin"}
              </button>
            </div>

            <div style={{ padding: "16px 24px 24px", borderTop: "1px solid #e5e7eb" }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#374151" }}>Your Tickets</h3>
              {tickets.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>You haven't raised any tickets yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                  {tickets.map((t) => {
                    const c = STATUS_COLOR[t.status] || STATUS_COLOR.open;
                    return (
                      <div key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{TYPE_LABEL[t.type]}</span>
                          <span style={{ background: c.bg, color: c.fg, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{STATUS_LABEL[t.status]}</span>
                        </div>
                        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280", whiteSpace: "pre-wrap" }}>{t.note}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#374151" };
const inp: React.CSSProperties = { padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, fontWeight: 400, color: "#111827", outline: "none" };
