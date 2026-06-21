import { useState, useEffect } from "react";
import { UserProfile } from "../types";

const ITEMS = [
  { id: "live-training",   day: 1, label: "Attend Monday live training" },
  { id: "begin-playbook",  day: 1, label: "Begin Playbook training course" },
  { id: "complete-session",day: 1, label: "Complete training session" },
  { id: "meet-manager",    day: 1, label: "Meet with manager and schedule field ride-along" },
  { id: "meet-rep",        day: 2, label: "Meet assigned rep" },
  { id: "go-field",        day: 2, label: "Go into the field" },
  { id: "first-roof",      day: 2, label: "Get on your first roof" },
];

const HIDE_AFTER_DAYS = 7;
const STORAGE_KEY = (userId: string) => `quickstart_${userId}`;
const HIDDEN_KEY  = (userId: string) => `quickstart_hidden_${userId}`;

export function QuickStartChecklist({ profile }: { profile: UserProfile }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hidden, setHidden]   = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    // Check 7-day expiry from createdAt
    if (profile.createdAt) {
      const created = new Date(profile.createdAt).getTime();
      const now     = Date.now();
      const days    = (now - created) / (1000 * 60 * 60 * 24);
      if (days > HIDE_AFTER_DAYS) { setExpired(true); return; }
    }

    // Load persisted state
    try {
      const raw = localStorage.getItem(STORAGE_KEY(profile.id));
      if (raw) setChecked(JSON.parse(raw));
      const h = localStorage.getItem(HIDDEN_KEY(profile.id));
      if (h === "1") setHidden(true);
    } catch {}
  }, [profile.id, profile.createdAt]);

  if (expired) return null;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(STORAGE_KEY(profile.id), JSON.stringify(next));
      return next;
    });
  }

  function toggleHidden() {
    setHidden((h) => {
      const next = !h;
      localStorage.setItem(HIDDEN_KEY(profile.id), next ? "1" : "0");
      return next;
    });
  }

  const day1 = ITEMS.filter((i) => i.day === 1);
  const day2 = ITEMS.filter((i) => i.day === 2);
  const done  = ITEMS.filter((i) => checked[i.id]).length;
  const total = ITEMS.length;
  const pct   = Math.round((done / total) * 100);

  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb",
      borderRadius: 12, overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      marginBottom: 24,
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px",
        background: "linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>48-Hour Quick Start</div>
            <div style={{ fontSize: 12, color: "#bfdbfe" }}>Be on a roof within 48 hours</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Progress pill */}
          <div style={{
            background: "rgba(255,255,255,0.15)", borderRadius: 999,
            padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "#fff",
          }}>
            {done}/{total} &nbsp;·&nbsp; {pct}%
          </div>
          <button
            onClick={toggleHidden}
            title={hidden ? "Show checklist" : "Hide checklist"}
            style={{
              background: "rgba(255,255,255,0.15)", border: "none",
              borderRadius: 6, color: "#fff", cursor: "pointer",
              padding: "4px 10px", fontSize: 13, fontWeight: 600,
            }}
          >
            {hidden ? "Show" : "Hide"}
          </button>
        </div>
      </div>

      {!hidden && (
        <div style={{ padding: "16px 20px" }}>
          {/* Progress bar */}
          <div style={{ height: 6, borderRadius: 999, background: "#e5e7eb", marginBottom: 16, overflow: "hidden" }}>
            <div style={{
              width: `${pct}%`, height: "100%",
              background: pct === 100 ? "#10b981" : "#2563eb",
              transition: "width 0.4s",
            }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[{ label: "Day 1 – Orientation & Training", items: day1 },
              { label: "Day 2 – Field Training",         items: day2 }].map((group) => (
              <div key={group.label}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: "#6b7280",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  marginBottom: 8,
                }}>
                  {group.label}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {group.items.map((item) => (
                    <label key={item.id} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      cursor: "pointer", padding: "6px 8px",
                      borderRadius: 6,
                      background: checked[item.id] ? "#f0fdf4" : "#fafafa",
                      border: `1px solid ${checked[item.id] ? "#bbf7d0" : "#f3f4f6"}`,
                      transition: "background 0.2s",
                    }}>
                      <input
                        type="checkbox"
                        checked={!!checked[item.id]}
                        onChange={() => toggle(item.id)}
                        style={{ marginTop: 2, accentColor: "#2563eb", cursor: "pointer" }}
                      />
                      <span style={{
                        fontSize: 13, color: checked[item.id] ? "#6b7280" : "#111827",
                        textDecoration: checked[item.id] ? "line-through" : "none",
                        lineHeight: 1.4,
                      }}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {pct === 100 && (
            <div style={{
              marginTop: 14, padding: "10px 16px",
              background: "#f0fdf4", border: "1px solid #bbf7d0",
              borderRadius: 8, textAlign: "center",
              fontSize: 13, fontWeight: 600, color: "#166534",
            }}>
              🎉 Quick Start Complete! You're ready to go.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
