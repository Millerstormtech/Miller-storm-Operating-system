import { useState } from "react";
import type { TeamStanding } from "../../../lib/training/board";
import { GREEN, MEDALS, RING_TRACK } from "./constants";

/**
 * Team vs Team (spec 2026-07-23 §2): display-only standings, ranked by
 * average completion % (zeros included; the whole roster counts). Desktop:
 * a card pinned in the side rail. Narrow: a collapsed tap-to-open bar, the
 * same interaction as the legend. Ranks are always company-wide: a branch
 * filter may HIDE rows but never renumbers them or re-mints medals.
 */
export function TeamStandings({
  standings,
  activeTeam,
  isNarrow,
}: {
  standings: TeamStanding[];
  activeTeam: string;
  isNarrow: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (standings.length === 0) return null;

  const list = (
    <div>
      {standings.map((s) => {
        const highlight = !!activeTeam && s.team === activeTeam;
        return (
          <div
            key={s.team}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 8px",
              borderRadius: 8,
              background: highlight ? "#eef2ff" : "transparent",
              border: highlight ? "1px solid #c7d2fe" : "1px solid transparent",
              marginBottom: 2,
            }}
          >
            <span
              style={{
                width: 22,
                textAlign: "center",
                flexShrink: 0,
                fontSize: s.rank <= 3 ? 14 : 12,
                fontWeight: 700,
                color: "#9ca3af",
              }}
            >
              {s.rank <= 3 ? MEDALS[s.rank - 1] : s.rank}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#111827",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                Team {s.team}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                <div style={{ flex: 1, height: 5, background: RING_TRACK, borderRadius: 3 }}>
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, s.avgPct))}%`,
                      height: 5,
                      background: GREEN,
                      borderRadius: 3,
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#111827" }}>{s.avgPct}%</span>
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                {s.size} rep{s.size === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  if (!isNarrow) {
    return (
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: "12px 10px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#6b7280",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            margin: "0 8px 8px",
          }}
        >
          🏆 Team standings
        </div>
        {list}
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: open ? "10px 10px" : 0,
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
          padding: open ? "0 2px 8px" : "9px 11px",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "#374151",
        }}
      >
        <span>🏆 Team standings</span>
        <span>{open ? "▴" : "▸"}</span>
      </button>
      {open && list}
    </div>
  );
}
