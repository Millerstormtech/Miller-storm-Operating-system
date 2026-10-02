import { useEffect, useState } from "react";
import { EMAIL_DEFAULTS, GLOBAL_VARIABLES, renderTemplate, unknownVariables } from "../../lib/emailTemplates";

type EmailKey = keyof typeof EMAIL_DEFAULTS;

const EMAIL_LABELS: Record<string, string> = {
  certificateEarned: "Certificate Earned (Rep)",
  contractKingCertificate: "Contract King Certificate (Rep)",
  passwordReset: "Password Reset",
  registrationConfirmation: "Registration Confirmation",
  accountApproved: "Account Approved",
  accountRejected: "Account Rejected",
  quickStartUser: "Quick Start (User)",
  quickStartManager: "Quick Start (Sales Team Lead)",
  userAccountUpdated: "User Account Updated",
  newRegistrationAdmin: "New Registration (Admin)",
  managerDeadlineMissed: "Training Deadline Missed (Sales Team Lead)",
  weeklyTeamDigest: "Weekly Team Digest (Sales Team Lead)",
  supportTicketCreated: "Support Ticket Created (Admin)",
  ticketReply: "Ticket Reply (User & Admin)",
  ticketInProgress: "Ticket In Progress (User)",
  ticketCompleted: "Ticket Completed (User)",
};

// A template with no label still shows (by its key) rather than as a blank row.
const labelFor = (key: string) => EMAIL_LABELS[key] ?? key;

// The template list, alphabetical by the name shown.
const TEMPLATE_KEYS = Object.keys(EMAIL_DEFAULTS).sort((a, b) =>
  labelFor(a).localeCompare(labelFor(b), undefined, { sensitivity: "base" })
);

type ConfigMap = Record<string, { subject: string; body: string; status: string }>;

// Templates that use a {{field}} their email never fills in. Saving one of these
// would send people a raw "{{password}}", so both save paths refuse it.
function findUnknownFields(configs: ConfigMap): { key: string; fields: string[] }[] {
  return TEMPLATE_KEYS
    .map((key) => ({ key, fields: unknownVariables(key, configs[key]?.subject || "", configs[key]?.body || "") }))
    .filter((p) => p.fields.length > 0);
}

function describeUnknownFields(problems: { key: string; fields: string[] }[]): string {
  return problems.map((p) => `${labelFor(p.key)}: ${p.fields.join(", ")}`).join("; ");
}

export function EmailConfig() {
  const [configs, setConfigs] = useState<ConfigMap>({});
  const [activeKey, setActiveKey] = useState<string>(TEMPLATE_KEYS[0]);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  // "Reset to Default" asks first: it wipes any custom wording on the template.
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    fetch("/api/admin/email-config")
      .then(r => r.ok ? r.json() : {})
      .then((saved: ConfigMap) => {
        const merged: ConfigMap = {};
        Object.keys(EMAIL_DEFAULTS).forEach(key => {
          merged[key] = {
            subject: saved[key]?.subject ?? EMAIL_DEFAULTS[key].subject,
            body: saved[key]?.body ?? EMAIL_DEFAULTS[key].body,
            status: saved[key]?.status ?? "published",
          };
        });
        setConfigs(merged);
        setLoaded(true);
      });
  }, []);

  function updateField(key: string, field: "subject" | "body" | "status", value: string) {
    setConfigs(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function resetToDefault(key: string) {
    setConfigs(prev => ({
      ...prev,
      [key]: {
        subject: EMAIL_DEFAULTS[key].subject,
        body: EMAIL_DEFAULTS[key].body,
        status: prev[key]?.status ?? "published",
      }
    }));
  }

  async function handleSave() {
    const problems = findUnknownFields(configs);
    if (problems.length > 0) {
      setSaveNotice(`Not saved. These fields can't be filled in: ${describeUnknownFields(problems)}`);
      return;
    }
    setSaving(true);
    try {
      await fetch("/api/admin/email-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configs),
      });
      setSaveNotice("Saved!");
      setTimeout(() => setSaveNotice(""), 3000);
    } catch {
      setSaveNotice("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    // Switching saves every template, so it gets the same check as Save.
    const problems = findUnknownFields(configs);
    if (problems.length > 0) {
      setSaveNotice(`Not saved. These fields can't be filled in: ${describeUnknownFields(problems)}`);
      return;
    }
    const newStatus = active?.status === "published" ? "draft" : "published";
    // Update local state
    const updatedConfigs = { ...configs, [activeKey]: { ...configs[activeKey], status: newStatus } };
    setConfigs(updatedConfigs);
    // Save immediately to DB
    setTogglingStatus(true);
    try {
      await fetch("/api/admin/email-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfigs),
      });
    } catch {
      // revert on failure
      setConfigs(configs);
    } finally {
      setTogglingStatus(false);
    }
  }

  const active = configs[activeKey];
  const variables = EMAIL_DEFAULTS[activeKey]?.variables || [];
  // A refused save explains itself on its own line; "Saved!" fits in the button row.
  const refusal = saveNotice.startsWith("Not saved");
  const activeUnknown = active ? unknownVariables(activeKey, active.subject, active.body) : [];
  // The preview is the real email builder, so bold text, bullets, the shared
  // links and the copyright footer look exactly as they will in an inbox.
  const preview = active ? renderTemplate(active.body, active.subject, {}) : null;

  if (!loaded) return <div style={{ padding: 40, color: "var(--text-muted)", textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 80px)", overflow: "hidden" }}>
      {showResetConfirm && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="reset-confirm-title" style={{ width: 480 }}>
            <div className="dialog-title" id="reset-confirm-title">Reset to default?</div>
            <div style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>
              <p style={{ margin: "0 0 10px" }}>
                This replaces the subject line and email body of <strong>{labelFor(activeKey)}</strong> with
                the standard version stored in the app's code. Any wording written for this template on this
                page is lost.
              </p>
              <ul style={{ margin: "0 0 20px", paddingLeft: 18 }}>
                <li>This does not undo your last edit. The app keeps no history of earlier versions.</li>
                <li>Only this template changes. The other templates stay as they are.</li>
                <li>The Draft / Published setting stays as it is.</li>
                <li>
                  Nothing is saved yet. Click <strong>Save All Templates</strong> to keep the reset, or leave
                  this page without saving to undo it. Switching Draft / Published also saves it.
                </li>
              </ul>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn-secondary btn-cancel" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-success"
                onClick={() => {
                  resetToDefault(activeKey);
                  setShowResetConfirm(false);
                }}
              >
                Yes, reset
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Left tab list */}
      <div style={{ width: 220, borderRight: "1px solid var(--border-default)", overflowY: "auto", flexShrink: 0, background: "var(--surface-subtle)" }}>
        <div style={{ padding: "16px 16px 8px", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>
          Email Templates
        </div>
        {TEMPLATE_KEYS.map(key => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveKey(key)}
            style={{
              width: "100%", textAlign: "left", padding: "12px 16px",
              border: "none", background: activeKey === key ? "rgba(202,0,2,0.1)" : "transparent",
              borderLeft: activeKey === key ? "3px solid #e01418" : "3px solid transparent",
              cursor: "pointer", fontSize: 13, fontWeight: activeKey === key ? 600 : 400,
              color: activeKey === key ? "#e01418" : "var(--text-tertiary)",
            }}
          >
            {labelFor(key)}
          </button>
        ))}
      </div>

      {/* Right editor */}
      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: refusal ? 12 : 24 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif', fontSize: 24, fontWeight: 800, letterSpacing: "0.01em", color: "var(--text-primary)", marginBottom: 4 }}>
              {labelFor(activeKey)}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Edit the subject and body. Use the dynamic fields below in your content.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {saveNotice && !refusal && (
              <span style={{ fontSize: 12, fontWeight: 500, color: "#16a34a", whiteSpace: "nowrap" }}>{saveNotice}</span>
            )}
            {/* Draft / Published toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: active?.status !== "published" ? "var(--text-secondary)" : "var(--text-subtle)" }}>Draft</span>
              <div
                onClick={togglingStatus ? undefined : handleToggleStatus}
                style={{
                  width: 40, height: 22, borderRadius: 11,
                  cursor: togglingStatus ? "wait" : "pointer",
                  background: active?.status === "published" ? "#10b981" : "var(--surface-muted)",
                  position: "relative", transition: "background 0.2s", flexShrink: 0,
                  opacity: togglingStatus ? 0.6 : 1,
                }}
              >
                <span style={{
                  position: "absolute", top: 2,
                  left: active?.status === "published" ? 20 : 2,
                  width: 18, height: 18, borderRadius: "50%",
                  background: "var(--surface-default)", transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: active?.status === "published" ? "#10b981" : "var(--text-subtle)" }}>Published</span>
            </div>
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-default)", fontSize: 13, cursor: "pointer", color: "var(--text-primary)", whiteSpace: "nowrap" }}
            >
              Reset to Default
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "linear-gradient(90deg, #b30002, #e01418)", color: "var(--text-inverse)", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {saving ? "Saving..." : "Save All Templates"}
            </button>
          </div>
        </div>

        {refusal && (
          <div role="status" style={{ marginBottom: 20, fontSize: 13, fontWeight: 500, color: "var(--brand-on-surface)" }}>{saveNotice}</div>
        )}

        {/* Dynamic variables reference */}
        <div style={{ marginBottom: 20, padding: 14, background: "rgba(241,195,60,0.1)", border: "1px solid rgba(241,195,60,0.3)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>Available Dynamic Fields:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[...variables, ...GLOBAL_VARIABLES.filter(v => !variables.includes(v))].map(v => (
              <span key={v} style={{ padding: "3px 10px", background: "rgba(241,195,60,0.16)", border: "1px solid rgba(241,195,60,0.4)", borderRadius: 4, fontSize: 12, fontFamily: "monospace", color: "var(--text-primary)" }}>
                {v}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
            Copy and paste these exactly into your subject or body. They will be replaced with real values when the email is sent.
            {" "}{GLOBAL_VARIABLES.join(", ")} are the app links and work in every email.
            {" "}Wrap text in **double asterisks** to make it bold. Start a line with * or - to make it a bullet.
            {" "}The copyright line is added automatically at the bottom of every email.
          </div>
        </div>

        {activeUnknown.length > 0 && (
          <div role="alert" style={{ marginBottom: 20, padding: 14, border: "1px solid var(--brand-fill)", borderRadius: 8, fontSize: 13, color: "var(--text-primary)" }}>
            <strong>This email can't fill in {activeUnknown.join(", ")}.</strong> People would see it written out
            exactly like that. Remove it, or use one of the fields listed above. Saving is blocked until it's fixed.
          </div>
        )}

        {/* Subject */}
        <label style={{ display: "block", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6 }}>Subject Line</div>
          <input
            className="field-input"
            value={active?.subject || ""}
            onChange={e => updateField(activeKey, "subject", e.target.value)}
            style={{ width: "100%", fontSize: 14 }}
          />
        </label>

        {/* Body */}
        <label style={{ display: "block", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6 }}>Email Body</div>
          <textarea
            className="field-input"
            rows={18}
            value={active?.body || ""}
            onChange={e => updateField(activeKey, "body", e.target.value)}
            style={{ width: "100%", fontSize: 13, fontFamily: "monospace", lineHeight: 1.7, resize: "vertical" }}
          />
        </label>

        {/* Live preview */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 10 }}>Preview</div>
          <div style={{ border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ background: "var(--surface-subtle)", padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", borderBottom: "1px solid var(--border-default)" }}>
              <strong>Subject:</strong> {preview?.subject}
            </div>
            {/* sandbox with no permissions: the email HTML is shown, never run. */}
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={preview?.html || ""}
              style={{ display: "block", width: "100%", height: 640, border: "none" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
