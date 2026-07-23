import { useState } from "react";

/**
 * Hide/unhide reps from THIS admin's view of the board (the existing
 * per-admin hiddenLeaderboardUsers pref). Checked = hidden.
 */
export function HideModal({
  rows,
  hiddenIds,
  onClose,
  onSave,
}: {
  rows: Array<{ id: string; name: string; email: string }>;
  hiddenIds: Set<string>;
  onClose: () => void;
  onSave: (newHidden: Set<string>) => void;
}) {
  const [selection, setSelection] = useState<Set<string>>(new Set(hiddenIds));
  const [search, setSearch] = useState("");
  const visible = rows.filter((r) =>
    `${r.name} ${r.email}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth: 460,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>Hide or unhide users</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              Checked users are hidden from your view of the board.
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af", lineHeight: 1, padding: 4 }}>
            ×
          </button>
        </div>
        <div style={{ padding: "14px 24px 0" }}>
          <input
            type="text"
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px 16px" }}>
          {visible.map((r, idx) => (
            <label
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 6px",
                cursor: "pointer",
                background: idx % 2 === 0 ? "#fff" : "#fafafa",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={selection.has(r.id)}
                onChange={() =>
                  setSelection((prev) => {
                    const next = new Set(prev);
                    if (next.has(r.id)) next.delete(r.id);
                    else next.add(r.id);
                    return next;
                  })
                }
                style={{ width: 15, height: 15, cursor: "pointer" }}
              />
              <span style={{ fontWeight: 600, color: "#111827", flex: 1 }}>{r.name}</span>
              <span style={{ fontSize: 11, color: "#6b7280" }}>{r.email}</span>
            </label>
          ))}
        </div>
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f8fafc" }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(selection);
              onClose();
            }}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#2563eb", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
