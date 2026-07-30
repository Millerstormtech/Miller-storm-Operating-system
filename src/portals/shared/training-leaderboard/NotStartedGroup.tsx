import { useState } from "react";

/**
 * Reps with zero items completed, kept OUT of the ranking in a collapsed
 * group: visible (they are the most actionable people on the board) without
 * padding the rankings with zeros.
 */
export function NotStartedGroup({
  rows,
  isNarrow,
  onOpenRep,
}: {
  rows: Array<{ id: string; name: string; branch: string; team: string }>;
  isNarrow: boolean;
  onOpenRep?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fff",
          border: "1px dashed #d1d5db",
          borderRadius: 12,
          padding: "12px 14px",
          color: "#6b7280",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          Not started: {rows.length} rep{rows.length === 1 ? "" : "s"} {rows.length === 1 ? "hasn't" : "haven't"} watched anything yet
        </span>
        <span style={{ fontSize: 13 }}>{open ? "▴" : "▸"}</span>
      </button>
      {open && (
        <div style={{ border: "1px dashed #d1d5db", borderTop: "none", borderRadius: "0 0 12px 12px", padding: "8px 14px", background: "#fafafa" }}>
          {rows.map((r) => (
            <div
              key={r.id}
              onClick={onOpenRep ? () => onOpenRep(r.id) : undefined}
              role={onOpenRep ? "button" : undefined}
              tabIndex={onOpenRep ? 0 : undefined}
              onKeyDown={
                onOpenRep
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenRep(r.id);
                      }
                    }
                  : undefined
              }
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "5px 0",
                fontSize: 13,
                color: "#374151",
                cursor: onOpenRep ? "pointer" : "default",
              }}
            >
              <span>{r.name}</span>
              {!isNarrow && (
                <span style={{ color: "#9ca3af", fontSize: 12 }}>
                  {[r.branch, r.team && `Team ${r.team}`].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
