import { useEffect, useRef, useState } from "react";

/**
 * The visible admin menu (admin role only; the container gates rendering).
 * Replaces the old white-on-white invisible buttons. Deliberately has NO
 * Export CSV (dropped 2026-07-20) and no Rewards item (Plan 4).
 */
export function AdminMenu({ onOverride, onHide }: { onOverride: () => void; onHide: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const item: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "9px 14px",
    border: "none",
    background: "#fff",
    fontSize: 13,
    color: "#111827",
    cursor: "pointer",
  };
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        aria-label="Admin tools"
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "6px 11px",
          background: "#fff",
          color: "#374151",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            width: 200,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 200,
            overflow: "hidden",
          }}
        >
          <button style={item} onClick={() => { setOpen(false); onOverride(); }}>
            ⚙ Override progress…
          </button>
          <button style={{ ...item, borderTop: "1px solid #f3f4f6" }} onClick={() => { setOpen(false); onHide(); }}>
            👁 Hide or unhide users…
          </button>
        </div>
      )}
    </div>
  );
}
