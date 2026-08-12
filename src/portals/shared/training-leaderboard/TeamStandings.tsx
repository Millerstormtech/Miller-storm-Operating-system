import type { TeamStanding } from "../../../lib/training/board";

const COND = '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';

/**
 * Team vs Team (spec 2026-07-23 §2): display-only standings, ranked by average
 * completion % (zeros included; the whole roster counts). Full-width ranked
 * cards; #1 gets the red + gold treatment. Ranks are always company-wide: a
 * branch filter may HIDE rows but never renumbers them or re-mints medals.
 * Colours come from the semantic tokens (surface/text) plus fixed brand red +
 * gold, so the card themes itself in dark and light automatically.
 */
export function TeamStandings({
  standings,
  activeTeam,
}: {
  standings: TeamStanding[];
  activeTeam: string;
  isNarrow?: boolean;
}) {
  if (standings.length === 0) return null;

  return (
    <div data-tour="clb-standings">
      {standings.map((s) => {
        const top = s.rank === 1;
        const active = !!activeTeam && s.team === activeTeam;
        const pct = Math.min(100, Math.max(0, s.avgPct));
        return (
          <div
            key={s.team}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              borderRadius: 16,
              padding: "18px 24px",
              marginBottom: 12,
              color: top ? "#fff" : "var(--text-primary)",
              background: top
                ? "linear-gradient(100deg, #7a0d10 0%, #b31217 60%, #7a0d10 100%)"
                : "var(--surface-default)",
              border: `1px solid ${top ? "transparent" : active ? "rgba(202,0,2,0.5)" : "var(--border-default)"}`,
              boxShadow: top
                ? "0 12px 34px rgba(150,10,14,0.38)"
                : "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                width: 40,
                flexShrink: 0,
                fontFamily: COND,
                fontSize: 30,
                fontWeight: 800,
                color: top ? "#f1c33c" : "var(--text-subtle)",
              }}
            >
              {s.rank}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span
                  title={`${s.size} rep${s.size === 1 ? "" : "s"}`}
                  style={{
                    fontFamily: COND,
                    fontSize: 20,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Team {s.team}
                </span>
                <span style={{ fontFamily: COND, fontSize: 30, fontWeight: 800, flexShrink: 0 }}>{s.avgPct}%</span>
              </div>
              <div
                style={{
                  marginTop: 12,
                  height: 8,
                  borderRadius: 5,
                  background: top ? "rgba(255,255,255,0.24)" : "var(--surface-muted)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    borderRadius: 5,
                    background: top ? "#ffffff" : "linear-gradient(90deg, #b30002, #e01418)",
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
