import { useState } from "react";
import { PODIUM } from "./constants";
import { CREDENTIALS } from "../../../lib/training/credentials";

/**
 * The always-available key: what every icon means (Label: meaning) and how
 * each rank is reached, computed from the live course count. Collapsed by
 * default on every screen size (same interaction as the Sales Leaderboard's
 * "How to read this board" panel); the header toggles it.
 */
// totalCourses is retained in the signature (callers still pass it) but is no
// longer read: it fed the retired rank ladder labels.
export function Legend({ totalCourses: _totalCourses }: { totalCourses: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      data-tour="clb-legend"
      style={{
        background: "rgba(245, 158, 11, 0.12)",
        border: "1px solid rgba(245, 158, 11, 0.4)",
        borderRadius: 12,
        padding: open ? "12px 13px" : 0,
        marginBottom: 14,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          border: "none",
          background: "transparent",
          padding: open ? "0 0 8px" : "9px 11px",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "#d99a1c",
        }}
      >
        <span>&#9432; What the marks mean</span>
        <span>{open ? "▴" : "▸"}</span>
      </button>
      {open && (
        <>
          {/* The three credentials replace the four badges and the six rank
              titles, all retired 2026-08-15. Each track on a row counts only
              the courses inside that credential, which is why the three never
              add up to the overall percentage beside them. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: "var(--text-tertiary)" }}>
            {CREDENTIALS.map((c) => (
              <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 3,
                    background: "#ca0002",
                    border: "1.5px solid #ca0002",
                    flexShrink: 0,
                  }}
                />
                <b style={{ color: "var(--text-secondary)" }}>{c.label}</b>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", columnGap: 16, rowGap: 6, fontSize: 12, color: "var(--text-tertiary)", marginTop: 10 }}>
            <span>Filled mark: credential earned. Outlined: still in progress.</span>
            <span>Each percentage counts only that credential's courses, so the three do not add up to the overall bar.</span>
            <span>
              {PODIUM.emoji} {PODIUM.label}: {PODIUM.meaning}
            </span>
            <span>&#9650;&#9660; Rank change: since last week</span>
          </div>
        </>
      )}
    </div>
  );
}
