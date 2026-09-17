import { Fragment, useEffect, useState } from "react";
import { STATUS_LABEL, STATUS_COLOR } from "../../components/TicketButton";
import { supportTypeLabel, supportFieldLines, SUPPORT_CATEGORIES } from "../../lib/support/categories";
import { formatTicketNumber } from "../../lib/support/ticketNumberFormat";
import { useAuth } from "../../contexts/AuthContext";

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
  number?: number | null;
  userId: string;
  name: string;
  email: string;
  role: string;
  type: string;
  fields?: Record<string, string>;
  note: string;
  status: "open" | "approved" | "in_progress" | "completed" | "rejected";
  adminNote?: string;
  messages?: TicketMessage[];
  createdAt?: string;
  staffSeenAt?: string | null;
};

const STATUS_OPTIONS = ["open", "approved", "in_progress", "completed", "rejected"];

// Messages from the raiser staff hasn't SEEN yet — opening the conversation
// (pages/api/tickets/[id].ts's GET) or replying to it both count as seeing it,
// even with no reply sent. A message from the raiser after that still counts
// as pending again, same as before.
function pendingFromUser(t: Ticket): number {
  const msgs = t.messages ?? [];
  const seenAt = t.staffSeenAt ? new Date(t.staffSeenAt).getTime() : 0;
  let n = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.fromStaff) break;
    const at = m.createdAt ? new Date(m.createdAt).getTime() : Infinity;
    if (at <= seenAt) break;
    n++;
  }
  return n;
}

// When the conversation last moved — the newest message's timestamp, from
// either side. null when nobody has said anything yet (the original request
// doesn't count as a "message").
function lastMessageAt(t: Ticket): string | null {
  const msgs = t.messages ?? [];
  return msgs.length ? msgs[msgs.length - 1].createdAt ?? null : null;
}

export function TicketTable() {
  // Chat bubbles are coloured relative to whoever is looking: only *your own*
  // messages are red/right; everyone else's — the raiser AND other staff — are
  // white/left. So an admin viewing (or an admin viewing-as another handler)
  // never sees someone else's reply as if it were their own.
  const { user } = useAuth();
  const myId = user?.id ?? "";
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(""); // "" = any date, else "YYYY-MM-DD"
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  // Which ticket's conversation is expanded, the reply draft for it, and whether
  // a reply is in flight.
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Opening a ticket's conversation marks it seen server-side (GET on
  // /api/tickets/[id] records staffSeenAt for anyone other than the raiser),
  // which is what clears the "pending" badge — no reply required. Merge the
  // response in rather than just trusting the click, since the server is the
  // one deciding whether this viewer actually counts as staff for it.
  const openTicket = async (id: string) => {
    setOpenId(id);
    setDraft("");
    try {
      const res = await fetch(`/api/tickets/${id}`);
      if (res.ok) {
        const updated = await res.json();
        setTickets((prev) => prev.map((t) => (t.id === id ? { ...updated, number: t.number } : t)));
      }
    } catch {}
  };

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
        // /api/tickets/[id] doesn't carry `number` (only the list endpoint
        // computes it) — keep the one already on screen instead of losing it.
        setTickets((prev) => prev.map((t) => (t.id === id ? { ...updated, number: t.number } : t)));
      }
    } catch {} finally { setUpdating(null); }
  };

  const postMessage = async (id: string, payload: { text?: string; mediaUrl?: string; mediaType?: string }) => {
    const res = await fetch(`/api/tickets/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updated = await res.json();
      setTickets((prev) => prev.map((t) => (t.id === id ? { ...updated, number: t.number } : t)));
      return true;
    }
    return false;
  };

  const sendReply = async (id: string) => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      if (await postMessage(id, { text })) setDraft("");
    } catch {} finally { setSending(false); }
  };

  // Upload the picked photo/video, then post it as a message on the ticket.
  const attachAndSend = async (id: string, file: File) => {
    if (uploading || sending) return;
    const kind = file.type.startsWith("video") ? "video" : "image";
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/upload-image", { method: "POST", body: fd });
      if (!up.ok) return;
      const { url } = await up.json();
      await postMessage(id, { mediaUrl: url, mediaType: kind });
    } catch {} finally { setUploading(false); }
  };

  // Exactly the 4 real categories a ticket can be raised under today (Billing,
  // Draw Request, Miller Storm Tech, MSRR Tools Issue) — same list as the
  // "Reason" dropdown when raising a ticket. Legacy types (bug/feature/other)
  // are deliberately left out of this filter; they aren't a choice anymore.
  const typeOptions = SUPPORT_CATEGORIES
    .map((c) => ({ key: c.key, label: c.label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // A ticket's creation date as the viewer's own local calendar day (YYYY-MM-DD)
  // — matches what the DATE column already shows via toLocaleDateString(), so
  // picking a day in the date filter lines up with what's on screen.
  const dateKey = (d?: string) => (d ? new Date(d).toLocaleDateString("en-CA") : "");

  const byStatus = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);
  const byDate = !dateFilter ? byStatus : byStatus.filter((t) => dateKey(t.createdAt) === dateFilter);
  const byType = typeFilter === "all" ? byDate : byDate.filter((t) => t.type === typeFilter);
  // Search by ticket number (MS-001, ms-1, or just 1), name, email, or type —
  // the same fields visible in the table, so anything you can read you can find.
  const q = search.trim().toLowerCase();
  const filtered = !q
    ? byType
    : byType.filter((t) =>
        (t.number ? formatTicketNumber(t.number).toLowerCase() : "").includes(q) ||
        t.name?.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q) ||
        supportTypeLabel(t.type).toLowerCase().includes(q) ||
        t.note?.toLowerCase().includes(q)
      );
  // Tickets waiting on a staff reply float to the top so nothing gets missed.
  const rows = [...filtered].sort((a, b) => (pendingFromUser(b) > 0 ? 1 : 0) - (pendingFromUser(a) > 0 ? 1 : 0));

  return (
    <div style={{ background: "var(--surface-default)", border: "1px solid var(--border-default)", borderRadius: 16, padding: 24, boxShadow: "0 10px 24px rgba(15,23,42,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid var(--border-default)", fontSize: 14, background: "var(--surface-subtle)", color: "var(--text-primary)", fontWeight: 600 }}>
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          title="Filter by date raised"
          style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid var(--border-default)", fontSize: 14, background: "var(--surface-subtle)", color: "var(--text-primary)", fontWeight: 600 }}
        />
        {dateFilter && (
          <button
            type="button"
            onClick={() => setDateFilter("")}
            title="Clear date filter"
            style={{ padding: "8px 10px", borderRadius: 999, border: "1px solid var(--border-default)", fontSize: 13, background: "var(--surface-subtle)", color: "var(--text-muted)", cursor: "pointer" }}
          >
            Clear date
          </button>
        )}
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid var(--border-default)", fontSize: 14, background: "var(--surface-subtle)", color: "var(--text-primary)", fontWeight: 600 }}>
          <option value="all">All types</option>
          {typeOptions.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ticket # (MS-001), name, email, or type…"
          style={{ flex: "1 1 260px", maxWidth: 360, padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border-default)", fontSize: 14, background: "var(--surface-subtle)", color: "var(--text-primary)", outline: "none" }}
        />
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading tickets…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--text-subtle)" }}>
          No tickets
          {filter !== "all" ? ` with status "${STATUS_LABEL[filter]}"` : ""}
          {dateFilter ? ` on ${dateFilter}` : ""}
          {typeFilter !== "all" ? ` of type "${supportTypeLabel(typeFilter)}"` : ""}
          {q ? ` matching "${search.trim()}"` : ""}.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--surface-subtle)", textAlign: "left" }}>
                <th style={th}>Ticket No.</th>
                <th style={th}>User</th>
                <th style={th}>Type</th>
                <th style={th}>Details</th>
                <th style={th}>Date</th>
                <th style={th}>Last Update</th>
                <th style={th}>Status</th>
                <th style={th}>Update</th>
                <th style={th}>Chat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const c = STATUS_COLOR[t.status] || STATUS_COLOR.open;
                const count = t.messages?.length ?? 0;
                const pending = pendingFromUser(t);
                const open = openId === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr style={{ borderTop: "1px solid var(--border-default)" }}>
                      <td style={{ ...td, color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {t.number ? formatTicketNumber(t.number) : "—"}
                      </td>
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
                      <td style={{ ...td, whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: 12 }}>
                        {(() => {
                          const last = lastMessageAt(t);
                          return last ? new Date(last).toLocaleDateString() : "—";
                        })()}
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
                      <td style={td}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <button
                            onClick={() => { if (open) { setOpenId(null); } else { openTicket(t.id); } }}
                            style={{ padding: "6px 12px", borderRadius: 999, border: pending > 0 && !open ? "1px solid #CB0002" : "1px solid var(--border-default)", background: open ? "#CB0002" : "var(--surface-subtle)", color: open ? "var(--text-inverse)" : "var(--text-primary)", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                          >
                            💬 {count > 0 ? count : ""}
                          </button>
                          {/* Red badge: the raiser sent messages staff hasn't answered yet. */}
                          {pending > 0 && (
                            <span title={`${pending} unanswered message${pending > 1 ? "s" : ""} from ${t.name}`} style={{ background: "#CB0002", color: "var(--text-inverse)", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", boxShadow: "0 2px 6px rgba(203,0,2,0.35)" }}>
                              {pending} new
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0, background: "var(--surface-subtle)" }}>
                          <Conversation
                            ticket={t}
                            myId={myId}
                            draft={draft}
                            setDraft={setDraft}
                            sending={sending}
                            uploading={uploading}
                            onSend={() => sendReply(t.id)}
                            onAttach={(file) => attachAndSend(t.id, file)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Conversation(props: {
  ticket: Ticket;
  myId: string;
  draft: string;
  setDraft: (v: string) => void;
  sending: boolean;
  uploading: boolean;
  onSend: () => void;
  onAttach: (file: File) => void;
}) {
  const { ticket, myId, draft, setDraft, sending, uploading, onSend, onAttach } = props;
  const messages = ticket.messages ?? [];
  return (
    <div style={{ padding: 16, borderTop: "1px solid var(--border-default)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 10 }}>
        Conversation with {ticket.name}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", marginBottom: 12 }}>
        {/* The original request always leads the thread. It's the raiser's, so
            it's "mine" only when the viewer is the raiser. */}
        <Bubble mine={!!myId && ticket.userId === myId} fromStaff={false} name={ticket.name} text={ticket.note} when={ticket.createdAt} />
        {messages.map((m, i) => (
          <Bubble key={m._id || i} mine={!!myId && m.senderId === myId} fromStaff={!!m.fromStaff} name={m.senderName} text={m.text} when={m.createdAt} mediaUrl={m.mediaUrl} mediaType={m.mediaType} />
        ))}
        {messages.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--text-subtle)", fontStyle: "italic" }}>No replies yet. Start the conversation below.</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSend(); }}
          placeholder={messages.length === 0 ? "Ask the user a question…" : "Write a reply to the user…"}
          rows={2}
          style={{ flex: 1, resize: "vertical", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-default)", fontSize: 14, background: "var(--surface-default)", color: "var(--text-primary)", fontFamily: "inherit" }}
        />
        <label title="Attach photo or video" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 999, border: "1px solid var(--border-default)", background: "var(--surface-subtle)", cursor: uploading ? "default" : "pointer", fontSize: 18, flex: "0 0 auto" }}>
          {uploading ? "⏳" : "📎"}
          <input type="file" accept="image/*,video/*" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) onAttach(f); e.target.value = ""; }} style={{ display: "none" }} />
        </label>
        <button
          onClick={onSend}
          disabled={sending || !draft.trim()}
          style={{ padding: "10px 18px", borderRadius: 999, border: "none", background: sending || !draft.trim() ? "var(--border-default)" : "#CB0002", color: "var(--text-inverse)", fontSize: 14, fontWeight: 700, cursor: sending || !draft.trim() ? "default" : "pointer", whiteSpace: "nowrap" }}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

function Bubble(props: { mine: boolean; fromStaff: boolean; name: string; text: string; when?: string; mediaUrl?: string; mediaType?: string }) {
  const { mine, fromStaff, name, text, when, mediaUrl, mediaType } = props;
  // Side + colour follow the VIEWER (mine → right/red). The "· Support" label
  // still marks any staff message, so a left-side reply from another handler is
  // recognisable as support rather than the raiser.
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div style={{ maxWidth: "78%", background: mine ? "#CB0002" : "var(--surface-default)", color: mine ? "var(--text-inverse)" : "var(--text-primary)", border: mine ? "none" : "1px solid var(--border-default)", borderRadius: 12, padding: "8px 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, marginBottom: 2 }}>
          {fromStaff ? `${name} · Support` : name}
        </div>
        {mediaUrl && (mediaType === "video" ? (
          <video src={mediaUrl} controls style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 8, marginBottom: text ? 6 : 0, display: "block" }} />
        ) : (
          <a href={mediaUrl} target="_blank" rel="noreferrer"><img src={mediaUrl} alt="attachment" style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 8, marginBottom: text ? 6 : 0, display: "block" }} /></a>
        ))}
        {text && <div style={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</div>}
        {when && <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3, textAlign: "right" }}>{new Date(when).toLocaleString()}</div>}
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: "12px", verticalAlign: "top", color: "var(--text-tertiary)" };
