import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_BY_KEY, supportTypeLabel, isTicketOwner } from "../lib/support/categories";

type TicketMessage = {
  _id?: string;
  senderId: string;
  senderName: string;
  senderRole?: string;
  fromStaff?: boolean;
  text: string;
  mediaUrl?: string;
  mediaType?: string;
  createdAt?: string;
};

type Ticket = {
  id: string;
  userId?: string;
  name: string;
  email: string;
  type: string;
  fields?: Record<string, string>;
  note: string;
  status: "open" | "approved" | "in_progress" | "completed" | "rejected";
  adminNote?: string;
  messages?: TicketMessage[];
  createdAt?: string;
};

const STATUS_FLOW = ["open", "approved", "in_progress", "completed"];


export const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  approved: "Approved",
  in_progress: "In Progress",
  completed: "Completed",
  rejected: "Rejected",
};

export const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  open: { bg: "#dbeafe", fg: "#1e40af" },         // blue — newly opened
  approved: { bg: "#e0e7ff", fg: "#3730a3" },     /* tokens-guard-ignore: js-identifier */ // indigo — acknowledged
  in_progress: { bg: "#fef3c7", fg: "#92400e" },  // amber — being worked on
  completed: { bg: "#dcfce7", fg: "#166534" },    // green — done
  rejected: { bg: "#fee2e2", fg: "#b91c1c" },     /* tokens-guard-ignore: js-identifier */ // red — declined
};

export function TicketButton() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  // A ticket-type "owner" (their account email is in a category's emails list)
  // handles that type's tickets like an admin, but scoped. Owners and admins are
  // both "handlers": they get the red Tickets button and a scoped inbox. During
  // "View As" this correctly reflects the impersonated account (so you can check
  // a handler's ticket panel), since it keys off the impersonated `user`.
  const isOwner = isTicketOwner(user?.email);
  const isHandler = isAdmin || isOwner;

  // ── Handler: red "Tickets" button that shakes when open tickets exist ───────
  const [openCount, setOpenCount] = useState(0);
  useEffect(() => {
    if (!isHandler) return;
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
  }, [isHandler]);

  // ── User: modal with form + own ticket list ─────────────────────────────────
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("");
  // Values for the selected category's predefined fields, keyed by field.key.
  const [fields, setFields] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [toast, setToast] = useState("");
  // Which ticket's conversation is open, the reply draft, and whether it's sending.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Per-ticket "how many messages I've already seen", persisted so a support
  // reply the user hasn't opened shows a red pending badge on the ticket.
  const [readMap, setReadMap] = useState<Record<string, number>>({});

  // Let other UI (e.g. a "Submit Draw Request" sidebar item) open this same
  // support form, optionally pre-selecting a ticket type.
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      setSelectedId(null);
      setFields({});
      setNote("");
      if (typeof detail.type === "string") setType(detail.type);
      setOpen(true);
    }
    window.addEventListener("open-support-ticket", onOpen);
    return () => window.removeEventListener("open-support-ticket", onOpen);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ticketReadCounts");
      if (raw) setReadMap(JSON.parse(raw));
    } catch {}
  }, []);

  const markRead = useCallback((t: Ticket) => {
    const count = t.messages?.length ?? 0;
    setReadMap((prev) => {
      if (prev[t.id] === count) return prev;
      const next = { ...prev, [t.id]: count };
      try { localStorage.setItem("ticketReadCounts", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // New support replies since the user last opened this ticket = pending count.
  const pendingCount = (t: Ticket) => {
    const seen = readMap[t.id] ?? 0;
    return (t.messages ?? []).slice(seen).filter((m) => m.fromStaff).length;
  };

  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets");
      if (res.ok) setTickets(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (open) loadTickets();
  }, [open, loadTickets]);

  // While the modal is open, poll so an admin's reply / status change shows up
  // without reopening — the person can follow the ticket live.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(loadTickets, 8000);
    return () => clearInterval(t);
  }, [open, loadTickets]);

  // While a ticket is open, keep it marked read — so a reply that arrives via the
  // poll clears its pending badge instead of piling up while the user is reading.
  useEffect(() => {
    if (!selectedId) return;
    const t = tickets.find((x) => x.id === selectedId);
    if (t) markRead(t);
  }, [selectedId, tickets, markRead]);

  const [uploading, setUploading] = useState(false);

  // Post a message (text and/or a photo/video attachment) to a ticket.
  const sendMessage = async (id: string, payload: { text?: string; mediaUrl?: string; mediaType?: string }) => {
    const res = await fetch(`/api/tickets/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updated = await res.json();
      setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
      return true;
    }
    if (res.status === 409) {
      setToast("Support just replied — please read the latest message.");
      loadTickets();
    }
    return false;
  };

  const sendReply = async (id: string) => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      if (await sendMessage(id, { text })) setDraft("");
    } catch {} finally { setSending(false); }
  };

  // Upload a picked photo/video to /api/upload-image, then post it as a message.
  const attachAndSend = async (id: string, file: File) => {
    if (uploading || sending) return;
    const kind = file.type.startsWith("video") ? "video" : "image";
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/upload-image", { method: "POST", body: fd });
      if (!up.ok) { setToast("Upload failed. Try again."); return; }
      const { url } = await up.json();
      await sendMessage(id, { mediaUrl: url, mediaType: kind });
    } catch { setToast("Upload failed. Try again."); }
    finally { setUploading(false); }
  };

  const category = SUPPORT_CATEGORY_BY_KEY[type];

  const submit = async () => {
    if (!type) {
      setToast("Please select a reason.");
      return;
    }
    if (!note.trim()) {
      setToast("Please add a description.");
      return;
    }
    // Any required predefined field must be filled.
    const missing = (category?.fields || []).find((f) => f.required && !(fields[f.key] || "").trim());
    if (missing) {
      setToast(`Please fill "${missing.label}".`);
      return;
    }
    setSubmitting(true);
    try {
      // Name and email come straight from the signed-in account — the user
      // no longer types them.
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user?.name || user?.email || "",
          email: user?.email || "",
          type,
          note,
          fields,
        }),
      });
      if (res.ok) {
        setNote("");
        setFields({});
        setToast("✅ Sent to Support!");
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

  if (isHandler) {
    return (
      <>
        <style>{`@keyframes ticketShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-3px)}40%,80%{transform:translateX(3px)}}`}</style>
        <button
          type="button"
          className="ticket-btn"
          onClick={() => router.push(isAdmin ? "/admin/tickets" : "/tickets")}
          title="View tickets"
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
            lineHeight: 1,
            background: "#dc2626",
            color: "var(--text-inverse)",
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
          🎫 <span className="ticket-btn-text">Tickets</span>
          {openCount > 0 && (
            <span style={{
              position: "absolute", top: -6, right: -6, background: "var(--surface-inverse)", color: "var(--text-inverse)",
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
        className="ticket-btn"
        onClick={() => setOpen(true)}
        title="Contact Support"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", lineHeight: 1,
          background: "#bbf7d0", color: "#065f46", border: "1px solid #86efac",
          borderRadius: 6, padding: "9px 16px", fontWeight: 700, fontSize: 14,
          cursor: "pointer", marginRight: 8,
        }}
      >
        🎫 <span className="ticket-btn-text">Support</span>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "40px 16px" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--surface-default)", borderRadius: 14, maxWidth: 520, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
          >
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {selectedId ? (
                <button type="button" onClick={() => { setSelectedId(null); setDraft(""); }} style={{ background: "none", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>← Back</button>
              ) : (
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>🎫 Support</h2>
              )}
              <button type="button" onClick={() => { setOpen(false); setSelectedId(null); }} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-muted)" }}>×</button>
            </div>

            {selectedId ? (
              <TicketConversation
                ticket={tickets.find((t) => t.id === selectedId) || null}
                draft={draft}
                setDraft={setDraft}
                sending={sending}
                uploading={uploading}
                onSend={() => selectedId && sendReply(selectedId)}
                onAttach={(file) => selectedId && attachAndSend(selectedId, file)}
              />
            ) : (
            <>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={lbl}>Reason *
                <select value={type} onChange={(e) => { setType(e.target.value); setFields({}); }} style={inp}>
                  <option value="">Not Selected</option>
                  {SUPPORT_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label} — {c.reason}
                    </option>
                  ))}
                </select>
              </label>

              {/* Predefined fields for the selected reason (Option 2). */}
              {(category?.fields || []).map((f) => (
                <label key={f.key} style={lbl}>
                  {f.label}{f.required ? " *" : ""}
                  {f.type === "select" ? (
                    <select
                      value={fields[f.key] || ""}
                      onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      style={inp}
                    >
                      <option value="">Select…</option>
                      {(f.options || []).map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={fields[f.key] || ""}
                      onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      style={inp}
                      placeholder={f.placeholder || ""}
                    />
                  )}
                </label>
              ))}

              <label style={lbl}>Description *
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} style={{ ...inp, resize: "vertical" }} placeholder="Describe the issue or request..." />
              </label>

              {toast && <div style={{ fontSize: 13, color: toast.startsWith("✅") ? "#166534" : "#b91c1c", fontWeight: 600 }}>{toast}</div>}

              <button type="button" onClick={submit} disabled={submitting}
                style={{ background: "var(--surface-inverse)", color: "var(--text-inverse)", border: "none", borderRadius: 999, padding: "12px", fontWeight: 700, fontSize: 15, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1 }}>
                {submitting ? "Sending..." : "Send to Admin"}
              </button>
            </div>

            <div style={{ padding: "16px 24px 24px", borderTop: "1px solid var(--border-default)" }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--text-tertiary)" }}>Your Tickets</h3>
              {tickets.length === 0 ? (
                <p style={{ color: "var(--text-subtle)", fontSize: 13, margin: 0 }}>You haven't raised any tickets yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                  {tickets.map((t) => {
                    const c = STATUS_COLOR[t.status] || STATUS_COLOR.open;
                    const count = t.messages?.length ?? 0;
                    const pending = pendingCount(t);
                    return (
                      <div
                        key={t.id}
                        onClick={() => { setSelectedId(t.id); setDraft(""); markRead(t); }}
                        style={{ border: `1px solid ${pending > 0 ? "#CB0002" : "var(--border-default)"}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{supportTypeLabel(t.type)}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {pending > 0 && (
                              <span style={{ background: "#CB0002", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                                {pending} new
                              </span>
                            )}
                            <span style={{ background: c.bg, color: c.fg, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{STATUS_LABEL[t.status]}</span>
                          </div>
                        </div>
                        <p style={{ margin: "6px 0 4px", fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>{t.note}</p>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#CB0002" }}>
                          💬 {pending > 0
                            ? `${pending} new ${pending === 1 ? "reply" : "replies"} · Tap to open`
                            : count > 0 ? `${count} ${count === 1 ? "reply" : "replies"} · Tap to open` : "Tap to open conversation"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function TicketConversation(props: {
  ticket: Ticket | null;
  draft: string;
  setDraft: (v: string) => void;
  sending: boolean;
  uploading: boolean;
  onSend: () => void;
  onAttach: (file: File) => void;
}) {
  const { ticket, draft, setDraft, sending, uploading, onSend, onAttach } = props;
  if (!ticket) return null;
  const messages = ticket.messages ?? [];
  const status = ticket.status;
  const current = STATUS_FLOW.indexOf(status);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Status header + stepper */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-default)" }}>
        <span style={{ background: (STATUS_COLOR[status] || STATUS_COLOR.open).bg, color: (STATUS_COLOR[status] || STATUS_COLOR.open).fg, borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{STATUS_LABEL[status]}</span>
        {status !== "rejected" && (
          <div style={{ display: "flex", alignItems: "center", marginTop: 14 }}>
            {STATUS_FLOW.map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", flex: i < STATUS_FLOW.length - 1 ? 1 : "0 0 auto" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: i <= current ? "#CB0002" : "var(--surface-subtle)", border: `2px solid ${i <= current ? "#CB0002" : "var(--border-default)"}`, color: "#fff", fontSize: 11 }}>{i <= current ? "✓" : ""}</div>
                  <span style={{ fontSize: 9, fontWeight: i === current ? 700 : 500, color: i <= current ? "var(--text-primary)" : "var(--text-subtle)" }}>{STATUS_LABEL[s]}</span>
                </div>
                {i < STATUS_FLOW.length - 1 && <div style={{ flex: 1, height: 2, margin: "0 4px 16px", background: i < current ? "#CB0002" : "var(--border-default)" }} />}
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)" }}>Your request</div>
        <div style={{ fontSize: 14, color: "var(--text-primary)", marginTop: 2, whiteSpace: "pre-wrap" }}>{ticket.note}</div>
      </div>

      {/* Conversation */}
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
        {messages.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-subtle)", fontStyle: "italic", textAlign: "center", padding: "16px 0" }}>No replies yet. Support will reach out here if they need anything.</div>
        ) : (
          messages.map((m, i) => {
            const mine = !m.fromStaff;
            return (
              <div key={m._id || i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "80%", background: mine ? "#CB0002" : "var(--surface-subtle)", color: mine ? "#fff" : "var(--text-primary)", border: mine ? "none" : "1px solid var(--border-default)", borderRadius: 12, padding: "8px 12px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, marginBottom: 2 }}>{m.fromStaff ? `${m.senderName} · Support` : m.senderName}</div>
                  {m.mediaUrl && (m.mediaType === "video" ? (
                    <video src={m.mediaUrl} controls style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 8, marginBottom: m.text ? 6 : 0, display: "block" }} />
                  ) : (
                    <a href={m.mediaUrl} target="_blank" rel="noreferrer">
                      <img src={m.mediaUrl} alt="attachment" style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 8, marginBottom: m.text ? 6 : 0, display: "block" }} />
                    </a>
                  ))}
                  {m.text && <div style={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>}
                  {m.createdAt && <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3, textAlign: "right" }}>{new Date(m.createdAt).toLocaleString()}</div>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Reply box — either side can send anytime (no turn restriction). */}
      <div style={{ padding: 16, borderTop: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSend(); }} placeholder="Write a reply…" rows={2} style={{ flex: 1, resize: "vertical", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-default)", fontSize: 14, background: "var(--surface-default)", color: "var(--text-primary)", fontFamily: "inherit" }} />
          <label title="Attach photo or video" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 999, border: "1px solid var(--border-default)", background: "var(--surface-subtle)", cursor: uploading ? "default" : "pointer", fontSize: 18, flex: "0 0 auto" }}>
            {uploading ? "⏳" : "📎"}
            <input type="file" accept="image/*,video/*" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) onAttach(f); e.target.value = ""; }} style={{ display: "none" }} />
          </label>
          <button onClick={onSend} disabled={sending || !draft.trim()} style={{ padding: "10px 18px", borderRadius: 999, border: "none", background: sending || !draft.trim() ? "var(--border-default)" : "#CB0002", color: "#fff", fontSize: 14, fontWeight: 700, cursor: sending || !draft.trim() ? "default" : "pointer", whiteSpace: "nowrap" }}>{sending ? "Sending…" : "Send"}</button>
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--text-tertiary)" };
const inp: React.CSSProperties = { padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, fontWeight: 400, color: "var(--text-primary)", outline: "none" };
