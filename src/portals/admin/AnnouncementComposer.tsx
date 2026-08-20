import { useEffect, useState } from "react";
import { appConfirm } from "../../lib/appDialogs";

// Compose + send a company-wide announcement (admin & c-level). Shows a live
// preview of the pop-up, and a deliberate confirm step before the blast since
// it reaches everyone and cannot be recalled.
export function AnnouncementComposer() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [recipients, setRecipients] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Audience size for the confirm step.
  useEffect(() => {
    fetch("/api/announcements")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRecipients(typeof d?.recipients === "number" ? d.recipients : null))
      .catch(() => {});
  }, []);

  const canSend = title.trim().length > 0 && message.trim().length > 0 && !sending;

  async function send() {
    if (!canSend) return;
    const who = recipients != null ? `${recipients} people` : "everyone";
    const ok = await appConfirm(
      `This announcement will be sent to ${who} and pushed to their phones. It can't be recalled. Send it now?`
    );
    if (!ok) return;
    setSending(true);
    setNotice(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), message: message.trim(), link: link.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNotice(`✅ Sent to ${data.recipients} people (${data.pushSuccess} phone pushes delivered).`);
        setTitle("");
        setMessage("");
        setLink("");
      } else {
        setNotice(`❌ ${data.error || "Failed to send announcement."}`);
      }
    } catch {
      setNotice("❌ Failed to send announcement.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start", padding: 4 }}>
      {/* Form */}
      <div style={{ flex: "1 1 420px", minWidth: 320, maxWidth: 560 }}>
        <div style={{ background: "var(--surface-default)", border: "1px solid var(--border-default)", borderRadius: 16, boxShadow: "0 10px 24px rgba(15,23,42,0.06)", padding: 20 }}>
          <div style={{ fontFamily: '"Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif', fontSize: 22, fontWeight: 800, letterSpacing: 0.2, textTransform: "uppercase", color: "var(--text-primary)", marginBottom: 4 }}>
            📢 New Announcement
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18 }}>
            Sent to everyone in Miller Storm — in-app pop-up, the notification bell, and a phone push.
          </div>

          <label style={labelStyle}>Title *</label>
          <input
            className="field-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. AccuLynx Two-Factor Authentication"
            maxLength={120}
            style={{ width: "100%", boxSizing: "border-box", marginBottom: 14 }}
          />

          <label style={labelStyle}>Message *</label>
          <textarea
            className="field-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="A short, important message for the whole company."
            rows={4}
            style={{ width: "100%", boxSizing: "border-box", marginBottom: 14, resize: "vertical", fontFamily: "inherit" }}
          />

          <label style={labelStyle}>Link (optional)</label>
          <input
            className="field-input"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…  (the “click here to know more” destination)"
            style={{ width: "100%", boxSizing: "border-box", marginBottom: 6 }}
          />
          <div style={{ fontSize: 12, color: "var(--text-subtle)", marginBottom: 18 }}>
            Any web address, internal or external. Leave blank for a simple “Got it” message.
          </div>

          <button
            type="button"
            className="btn-primary"
            disabled={!canSend}
            onClick={send}
            style={{ width: "100%", padding: "12px", fontSize: 15, fontWeight: 800, opacity: canSend ? 1 : 0.5 }}
          >
            {sending ? "Sending…" : recipients != null ? `Send to ${recipients} people` : "Send to everyone"}
          </button>

          {notice && (
            <div style={{ marginTop: 14, fontSize: 13.5, fontWeight: 600, color: notice.startsWith("✅") ? "#16a34a" : "#dc2626" }}>
              {notice}
            </div>
          )}
        </div>
      </div>

      {/* Live preview of the pop-up */}
      <div style={{ flex: "0 1 360px", minWidth: 300 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
          Preview
        </div>
        <div
          style={{
            width: 340,
            maxWidth: "100%",
            background: "linear-gradient(135deg, #e01418 0%, #b30002 100%)",
            color: "var(--text-inverse)",
            borderRadius: 14,
            boxShadow: "0 18px 45px rgba(202,0,2,0.4)",
            padding: "18px 18px 16px",
            position: "relative",
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6, paddingRight: 4 }}>
            {title.trim() || "Announcement title"}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, opacity: 0.95, marginBottom: 14, whiteSpace: "pre-wrap" }}>
            {message.trim() || "Your message to the whole company will appear here."}
          </div>
          <div style={{ width: "100%", background: "#fff", color: "#b30002", borderRadius: 9, padding: "10px 12px", fontSize: 14, fontWeight: 800, textAlign: "center" /* tokens-guard-ignore: fixed-brand, previews the live pop-up */ }}>
            {link.trim() ? "Learn more" : "Got it"}
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  marginBottom: 6,
};
