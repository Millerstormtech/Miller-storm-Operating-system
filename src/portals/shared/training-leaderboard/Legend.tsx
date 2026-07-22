import { useState } from "react";
import { rankRequirementLabels } from "../../../lib/training/board";
import type { RankTitle } from "../../../lib/training/scoring";
import { RANK_TITLES } from "../../../lib/training/scoring";
import { BADGE_META, PODIUM, TIER_COLORS } from "./constants";

/**
 * The always-available key: what every icon means (Label: meaning) and how
 * each rank is reached, computed from the live course count. Collapsed by
 * default on every screen size (same interaction as the Sales Leaderboard's
 * "How to read this board" panel); the header toggles it.
 */
export function Legend({ totalCourses }: { totalCourses: number }) {
  const [open, setOpen] = useState(false);
  const rankLabels = rankRequirementLabels(totalCourses);
  return (
    <div
      style={{
        background: "#fffbeb",
        border: "1px solid #fde68a",
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
          color: "#92400e",
        }}
      >
        <span>ⓘ What the icons and ranks mean</span>
        <span>{open ? "▴" : "▸"}</span>
      </button>
      {open && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", columnGap: 16, rowGap: 6, fontSize: 12, color: "#374151" }}>
            {Object.values(BADGE_META).map((m) => (
              <span key={m.label}>
                {m.emoji} {m.label}: {m.meaning}
              </span>
            ))}
            <span>
              {PODIUM.emoji} {PODIUM.label}: {PODIUM.meaning}
            </span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.5, margin: "12px 0 8px" }}>
            Ranks (by courses finished)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {RANK_TITLES.map((title: RankTitle) => {
              const tier = TIER_COLORS[title];
              return (
                <span
                  key={title}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: tier.bg,
                    color: tier.fg,
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontSize: 12,
                    fontWeight: title === "Legend" ? 700 : 600,
                  }}
                >
                  {title === "Legend" ? "🌟 Legend" : title}
                  <span style={{ opacity: 0.7, fontWeight: 500 }}>{rankLabels[title]}</span>
                </span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
