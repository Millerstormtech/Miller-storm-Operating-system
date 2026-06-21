import { useState, useEffect } from "react";

type Template = {
  key: string;
  label: string;
  template: string;
  status: "draft" | "published";
};

const VARIABLES = ["{user_name}", "{admin_name}", "{manager_name}", "{course_name}", "{training_duration}", "{time_remaining}"];

const ICONS: Record<string, string> = {
  start: "🚀",
  midpoint: "⏳",
  final: "⚠️",
  complete: "🏁",
  userAccountUpdate: "👤",
};

const TRIGGER_LABELS: Record<string, string> = {
  start: "Sent immediately when training begins",
  midpoint: "Sent at 50% of selected duration",
  final: "Sent 30 minutes before timer ends",
  complete: "Sent when the timer reaches zero",
  userAccountUpdate: "Sent when admin updates user account",
};

const ACCENTS: Record<string, { bg: string; border: string; badge: string; text: string }> = {
  start:    { bg: "#eff6ff", border: "#bfdbfe", badge: "#dbeafe", text: "#1d4ed8" },
  midpoint: { bg: "#fefce8", border: "#fde68a", badge: "#fef9c3", text: "#854d0e" },
  final:    { bg: "#fff7ed", border: "#fed7aa", badge: "#ffedd5", text: "#c2410c" },
  complete: { bg: "#f0fdf4", border: "#bbf7d0", badge: "#dcfce7", text: "#15803d" },
  userAccountUpdate: { bg: "#faf5ff", border: "#e9d5ff", badge: "#f3e8ff", text: "#7c3aed" },
};

export function Messaging() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sms-templates")
      .then(r => r.json())
      .then(data => { setTemplates(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave(key: string, template: string, status: "draft" | "published") {
    setSaving(key);
    try {
      await fetch("/api/sms-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, template, status }),
      });
      setSaved(key);
      setTimeout(() => setSaved(null), 2500);
    } catch {
      alert("Failed to save template");
    } finally {
      setSaving(null);
    }
  }

  function updateTemplate(key: string, value: string) {
    setTemplates(prev => prev.map(t => t.key === key ? { ...t, template: value } : t));
  }

  function updateStatus(key: string, status: "draft" | "published") {
    setTemplates(prev => prev.map(t => t.key === key ? { ...t, status } : t));
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 240 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "#2563eb", borderRadius: "50%", margin: "0 auto 12px" }} />
          <div style={{ color: "#6b7280", fontSize: 14 }}>Loading templates...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <style>{`
        @keyframes sms-spin { to { transform: rotate(360deg); } }
        .sms-spin { animation: sms-spin 0.7s linear infinite; }
        .sms-card { transition: box-shadow 0.2s; }
        .sms-card:hover { box-shadow: 0 6px 24px rgba(0,0,0,0.09) !important; }
        .sms-textarea:focus { border-color: #2563eb !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.12) !important; outline: none; }
        .sms-btn { transition: filter 0.15s, transform 0.1s; }
        .sms-btn:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
        .sms-btn:active:not(:disabled) { transform: translateY(0); }
        .sms-var:hover { background: #c7d2fe !important; }
        @media (max-width: 580px) {
          .sms-card-head { flex-direction: column !important; gap: 8px !important; }
          .sms-card-foot { flex-direction: column !important; }
          .sms-btn { width: 100% !important; justify-content: center !important; }
        }
      `}</style>

      {/* Hero banner */}
      <div style={{
        background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)",
        borderRadius: 14, padding: "22px 24px", marginBottom: 24, color: "#fff",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <span style={{ fontSize: 36, flexShrink: 0 }}>💬</span>
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>SMS Configuration</div>
          <div style={{ fontSize: 13, opacity: 0.88, lineHeight: 1.5 }}>
            Customize the 5 automated SMS alerts: 4 for training timer sessions and 1 for user account updates.
          </div>
        </div>
      </div>

      {/* Variables card */}
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
        padding: "16px 20px", marginBottom: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 15 }}>🔧</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Dynamic Variables</span>
          <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>Click to copy</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {VARIABLES.map(v => (
            <span
              key={v}
              className="sms-var"
              onClick={() => navigator.clipboard?.writeText(v)}
              title="Click to copy"
              style={{
                background: "#e0e7ff", color: "#3730a3",
                padding: "4px 10px", borderRadius: 6,
                fontSize: 13, fontFamily: "monospace", fontWeight: 500,
                border: "1px solid #c7d2fe", cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              {v}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 10 }}>
          Max 200 characters per template. Variables are replaced with live data when the SMS is sent.
        </div>
      </div>

      {/* Template cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {templates.map((t, i) => {
          const ac = ACCENTS[t.key] ?? ACCENTS.start;
          const isSaving = saving === t.key;
          const isSaved = saved === t.key;
          const isOver = t.template.length > 200;
          const charColor = isOver ? "#ef4444" : t.template.length > 160 ? "#f59e0b" : "#9ca3af";
          const isPublished = (t.status ?? "published") === "published";

          return (
            <div
              key={t.key}
              className="sms-card"
              style={{
                background: "#fff",
                border: `1px solid ${ac.border}`,
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
              }}
            >
              {/* Header */}
              <div style={{ background: ac.bg, padding: "14px 20px", borderBottom: `1px solid ${ac.border}` }}>
                <div className="sms-card-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{ICONS[t.key]}</span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>
                        Alert {i + 1} — {t.label}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                        {TRIGGER_LABELS[t.key]}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    {/* Draft / Published toggle */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: !isPublished ? "#1f2937" : "#9ca3af" }}>Draft</span>
                      <div
                        onClick={() => updateStatus(t.key, isPublished ? "draft" : "published")}
                        style={{
                          width: 40, height: 22, borderRadius: 11, cursor: "pointer",
                          background: isPublished ? "#10b981" : "#d1d5db",
                          position: "relative", transition: "background 0.2s", flexShrink: 0,
                        }}
                      >
                        <span style={{
                          position: "absolute", top: 2,
                          left: isPublished ? 20 : 2,
                          width: 18, height: 18, borderRadius: "50%",
                          background: "#fff", transition: "left 0.2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: isPublished ? "#10b981" : "#9ca3af" }}>Published</span>
                    </div>
                    <span style={{
                      background: ac.badge, color: ac.text,
                      fontSize: 11, fontWeight: 700, padding: "3px 10px",
                      borderRadius: 20, whiteSpace: "nowrap",
                    }}>
                      {i + 1} of 5
                    </span>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Message Template</label>
                  <span style={{ fontSize: 12, fontWeight: 600, color: charColor }}>
                    {t.template.length} / 200
                  </span>
                </div>

                <textarea
                  className="sms-textarea"
                  value={t.template}
                  onChange={e => updateTemplate(t.key, e.target.value)}
                  rows={3}
                  placeholder="Enter SMS message template..."
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    borderRadius: 8,
                    border: `1.5px solid ${isOver ? "#fca5a5" : "#e5e7eb"}`,
                    fontSize: 14,
                    lineHeight: 1.6,
                    resize: "vertical",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    background: isOver ? "#fff5f5" : "#fafafa",
                    color: "#111827",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                />

                {isOver && (
                  <div style={{ fontSize: 12, color: "#ef4444", marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
                    ⚠️ Exceeds 200 characters — shorten before saving.
                  </div>
                )}

                {/* Footer */}
                <div className="sms-card-foot" style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                  <button
                    className="sms-btn"
                    onClick={() => handleSave(t.key, t.template, t.status ?? "published")}
                    disabled={isSaving || isOver}
                    style={{
                      padding: "9px 22px",
                      borderRadius: 8,
                      background: isSaved
                        ? "#10b981"
                        : isOver
                        ? "#d1d5db"
                        : "linear-gradient(135deg, #2563eb, #1d4ed8)",
                      color: "#fff",
                      border: "none",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: isSaving || isOver ? "not-allowed" : "pointer",
                      opacity: isSaving ? 0.75 : 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      minWidth: 110,
                    }}
                  >
                    {isSaving ? (
                      <>
                        <span
                          className="sms-spin"
                          style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", flexShrink: 0 }}
                        />
                        Saving...
                      </>
                    ) : isSaved ? (
                      <>✓ Saved</>
                    ) : (
                      <>💾 Save</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
