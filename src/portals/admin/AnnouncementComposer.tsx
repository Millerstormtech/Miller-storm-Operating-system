import { useEffect, useState } from "react";
import { appConfirm } from "../../lib/appDialogs";

type AudienceType = "everyone" | "branch" | "team";
type AudienceOptions = { types: AudienceType[]; branches: string[]; teams: { id: string; name: string }[] };

const AUDIENCE_TYPE_LABEL: Record<AudienceType, string> = {
  everyone: "Everyone",
  branch: "Specific branch(es)",
  team: "Specific team(s)",
};

// Compose + send an announcement (admin, c-level, branch-manager, sales-team-lead).
// Shows a live preview of the pop-up, and a deliberate confirm step before the
// blast since it reaches its whole audience and cannot be recalled.
//
// "Who will see this" and its branch/team sub-picker are driven entirely by
// GET /api/announcements?options=1, which already scopes the choices to the
// caller's role (branch-manager only sees their own branch/teams, a
// sales-team-lead sees only their own team) — this component never decides
// who's allowed to pick what, it just renders whatever the server offers.
export function AnnouncementComposer() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [recipients, setRecipients] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [options, setOptions] = useState<AudienceOptions | null>(null);
  const [audienceType, setAudienceType] = useState<AudienceType>("everyone");
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [audienceLabel, setAudienceLabel] = useState<string>("Everyone");

  // Load this caller's audience-picker options once, and default to the
  // first (least-broad) type they're allowed — a branch-manager and a
  // sales-team-lead have no "everyone" option at all.
  useEffect(() => {
    fetch("/api/announcements?options=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AudienceOptions | null) => {
        if (!d) return;
        setOptions(d);
        setAudienceType(d.types[0] || "everyone");
        // A sales-team-lead has exactly one team (their own) — pre-select it
        // so there's nothing extra to click before sending.
        if (d.types[0] === "team" && d.teams.length === 1) setSelectedTeamIds([d.teams[0].id]);
      })
      .catch(() => {});
  }, []);

  // Recompute the audience size (and its label) whenever the pick changes.
  useEffect(() => {
    const params = new URLSearchParams({ audienceType });
    if (selectedBranches.length) params.set("branches", selectedBranches.join(","));
    if (selectedTeamIds.length) params.set("teamLeadIds", selectedTeamIds.join(","));
    fetch(`/api/announcements?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setRecipients(typeof d?.recipients === "number" ? d.recipients : null);
        if (d?.audienceLabel) setAudienceLabel(d.audienceLabel);
      })
      .catch(() => {});
  }, [audienceType, selectedBranches, selectedTeamIds]);

  function toggleBranch(b: string) {
    setSelectedBranches((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  }
  function toggleTeam(id: string) {
    setSelectedTeamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const audienceReady =
    audienceType === "everyone" ||
    (audienceType === "branch" && selectedBranches.length > 0) ||
    (audienceType === "team" && selectedTeamIds.length > 0);
  const canSend = title.trim().length > 0 && message.trim().length > 0 && audienceReady && !sending;

  async function send() {
    if (!canSend) return;
    const who = recipients != null ? `${recipients} people (${audienceLabel})` : audienceLabel;
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
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          link: link.trim(),
          audience:
            audienceType === "everyone"
              ? { type: "everyone" }
              : audienceType === "branch"
              ? { type: "branch", branches: selectedBranches }
              : { type: "team", teamLeadIds: selectedTeamIds },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNotice(`✅ Sent to ${data.recipients} people — ${data.audienceLabel} (${data.pushSuccess} phone pushes delivered).`);
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
            In-app pop-up, the notification bell, and a phone push — for whoever you choose below.
          </div>

          <label style={labelStyle}>Who will see this *</label>
          <select
            className="field-input"
            value={audienceType}
            onChange={(e) => {
              const next = e.target.value as AudienceType;
              setAudienceType(next);
              setSelectedBranches([]);
              setSelectedTeamIds([]);
            }}
            disabled={!options || options.types.length <= 1}
            style={{ width: "100%", boxSizing: "border-box", marginBottom: 10 }}
          >
            {(options?.types || ["everyone"]).map((t) => (
              <option key={t} value={t}>{AUDIENCE_TYPE_LABEL[t]}</option>
            ))}
          </select>

          {audienceType === "branch" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, padding: "10px 12px", border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--surface-subtle)" }}>
              {(options?.branches || []).length === 0 ? (
                <span style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>No branches found.</span>
              ) : (
                options!.branches.map((b) => (
                  <label key={b} style={chipStyle(selectedBranches.includes(b))}>
                    <input type="checkbox" checked={selectedBranches.includes(b)} onChange={() => toggleBranch(b)} style={{ marginRight: 6 }} />
                    {b}
                  </label>
                ))
              )}
            </div>
          )}

          {audienceType === "team" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, padding: "10px 12px", border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--surface-subtle)" }}>
              {(options?.teams || []).length === 0 ? (
                <span style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>No teams found.</span>
              ) : (
                options!.teams.map((t) => (
                  <label key={t.id} style={chipStyle(selectedTeamIds.includes(t.id))}>
                    <input type="checkbox" checked={selectedTeamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} style={{ marginRight: 6 }} />
                    {t.name}
                  </label>
                ))
              )}
            </div>
          )}

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
            placeholder="A short, important message for your audience."
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
            {sending
              ? "Sending…"
              : !audienceReady
              ? `Pick ${audienceType === "branch" ? "a branch" : "a team"} to send to`
              : recipients != null
              ? `Send to ${recipients} people`
              : `Send to ${audienceLabel}`}
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
            {message.trim() || "Your message will appear here."}
          </div>
          <div style={{ width: "100%", background: "#fff", color: "#b30002", borderRadius: 9, padding: "10px 12px", fontSize: 14, fontWeight: 800, textAlign: "center" /* tokens-guard-ignore: fixed-brand, previews the live pop-up */ }}>
            {link.trim() ? "Learn more" : "Got it"}
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-subtle)" }}>
          Going to: <b style={{ color: "var(--text-muted)" }}>{audienceLabel}</b>
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

function chipStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    border: `1px solid ${active ? "var(--brand-on-surface)" : "var(--border-default)"}`,
    background: active ? "var(--surface-muted)" : "var(--surface-default)",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
  };
}
