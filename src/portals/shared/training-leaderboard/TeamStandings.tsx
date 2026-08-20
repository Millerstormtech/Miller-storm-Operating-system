import { useState } from "react";
import type { OverallRow, TeamStanding } from "../../../lib/training/board";
import { teamMembers } from "../../../lib/training/board";
import { RepCard } from "./RepCard";

const COND = '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';

// The brand-red edge used both by a selected/open card and by the panel hanging
// under it, so the two always match. Declared once because brand red has no
// token yet and the design-token guard counts raw literals, not distinct values.
const OPEN_EDGE = "rgba(202,0,2,0.5)";

/**
 * Team vs Team (spec 2026-07-23 §2), expandable since 2026-08-14 (Jay,
 * 2026-08-12: "if I click Team Jonathan, John's team should come up ...
 * underneath here"). Ranked by average completion % (zeros included; the whole
 * roster counts). Full-width ranked cards; #1 gets the red + gold treatment.
 * Ranks are always company-wide: a branch filter may HIDE rows but never
 * renumbers them or re-mints medals. Colours come from the semantic tokens
 * (surface/text) plus fixed brand red + gold, so the card themes itself in dark
 * and light automatically.
 *
 * One team is open at a time. Opening a second closes the first, because two
 * expanded rosters push the reps list far enough down the page that the board
 * stops reading as a board.
 */
export function TeamStandings({
  standings,
  activeTeam,
  rows,
  isNarrow = false,
  youId = null,
  onOpenRep,
}: {
  standings: TeamStanding[];
  activeTeam: string;
  /**
   * The whole roster, unfiltered. Members are drawn from this rather than from
   * the filtered list on purpose: the percentage on the card is an average over
   * every rep on the team, so a search-filtered roster underneath it would not
   * add up to the number above it.
   */
  rows: OverallRow[];
  isNarrow?: boolean;
  youId?: string | null;
  onOpenRep?: (id: string) => void;
}) {
  const [openTeam, setOpenTeam] = useState<string | null>(null);

  if (standings.length === 0) return null;

  return (
    <div data-tour="clb-standings">
      {standings.map((s) => {
        const top = s.rank === 1;
        const active = !!activeTeam && s.team === activeTeam;
        const pct = Math.min(100, Math.max(0, s.avgPct));
        const open = openTeam === s.team;
        const panelId = `clb-team-${s.team.replace(/\s+/g, "-").toLowerCase()}`;
        const members = open ? teamMembers(rows, s.team) : [];

        return (
          <div key={s.team}>
            <div
              role="button"
              tabIndex={0}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpenTeam(open ? null : s.team)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpenTeam(open ? null : s.team);
                }
              }}
              title={open ? `Hide Team ${s.team}` : `Show the ${s.size} rep${s.size === 1 ? "" : "s"} on Team ${s.team}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                borderRadius: 16,
                padding: "18px 24px",
                marginBottom: open ? 8 : 12,
                cursor: "pointer",
                color: top ? "var(--text-inverse)" : "var(--text-primary)",
                background: top
                  ? "linear-gradient(100deg, #7a0d10 0%, #b31217 60%, #7a0d10 100%)"
                  : "var(--surface-default)",
                border: `1px solid ${top ? "transparent" : active || open ? OPEN_EDGE : "var(--border-default)"}`,
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
                    {/* The size used to be tooltip-only. It is on the card now
                        because it tells you how long the list you are about to
                        open is. */}
                    <span style={{ fontSize: 14, fontWeight: 700, opacity: 0.65, marginLeft: 8 }}>
                      {s.size} rep{s.size === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span style={{ fontFamily: COND, fontSize: 30, fontWeight: 800, flexShrink: 0 }}>{s.avgPct}%</span>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    height: 8,
                    borderRadius: 5,
                    background: top ? "rgba(255,255,255,0.24)" : "var(--surface-muted)",  /* tokens-guard-ignore: fixed-brand, track on the fixed-red #1 card */
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      borderRadius: 5,
                      // top uses --text-inverse (not --surface-default) even though this is a
                      // `background`: the top card is the FIXED brand-red treatment (see file
                      // header), theme-invariant by design, and --surface-default flips dark in
                      // dark mode while --text-inverse stays white in both — the only token that
                      // preserves the always-white fill against the always-red card.
                      background: top ? "var(--text-inverse)" : "linear-gradient(90deg, #b30002, #e01418)",
                    }}
                  />
                </div>
              </div>
              {/* Same reasoning as the bar above: on the fixed red card the only
                  token that stays white in both themes is --text-inverse. */}
              <div
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  fontSize: 13,
                  color: top ? "var(--text-inverse)" : "var(--text-subtle)",
                  opacity: top ? 0.85 : 1,
                  transform: open ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s ease",
                }}
              >
                ▾
              </div>
            </div>

            {open && (
              <div
                id={panelId}
                style={{
                  marginBottom: 12,
                  paddingLeft: isNarrow ? 0 : 22,
                  // Same edge as the open card above, so the panel reads as a
                  // continuation of it.
                  borderLeft: isNarrow ? "none" : `2px solid ${OPEN_EDGE}`,
                  marginLeft: isNarrow ? 0 : 12,
                }}
              >
                {members.length === 0 ? (
                  <div style={{ padding: "14px 4px", color: "var(--text-subtle)", fontSize: 13 }}>
                    Nobody is assigned to this team yet.
                  </div>
                ) : (
                  members.map((r, i) => (
                    <RepCard
                      key={r.id}
                      row={r}
                      // Position on the team, with the true company rank kept in
                      // the tooltip: a team list must never look like it is
                      // renumbering the company board.
                      primaryRank={i + 1}
                      coRank={r.rank}
                      isNarrow={isNarrow}
                      youTag={r.id === youId}
                      onClick={onOpenRep ? () => onOpenRep(r.id) : undefined}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
