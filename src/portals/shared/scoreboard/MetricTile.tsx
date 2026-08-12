import type { Window } from "../../../lib/acculynx/windows";
import { barFill, paceNotch, fmtMoney, fmtCount, trendLabel } from "../../../lib/scoreboard/display";

// Same green/red used elsewhere for up/down (training-leaderboard/constants.ts),
// kept as local tokens here since this is a different subsystem and shouldn't
// cross-import another feature's constants module for two hex codes.
const GREEN = "#10b981";
const RED = "#ff6b6d";
const NEUTRAL = "#9aa1b3";
const BAR = "#e01418";
const TRACK = "var(--surface-muted)";
const NOTCH = "rgba(255,255,255,0.55)";

// The goal link is hidden until My Goals launches (no goals are set yet, the
// backfill is deliberately unapplied). Flip to true to bring back
// "Set your goals" / "Edit goals" on every tile at once -- this is the only
// place that decides whether the link renders, for all three ScoreboardHome
// tiles, since they all render through this one component. The `onSetGoal`
// prop, its wiring in ScoreboardHome.tsx, and the /sales/plan route are left
// untouched, so flipping this one flag is the entire restore.
const SHOW_GOAL_LINK = false;

/**
 * One scoreboard tile: label, value, an honest trend, and (when a goal
 * exists) a progress bar with a pace notch. Every calculation here is
 * delegated to src/lib/scoreboard/display.ts -- this component only decides
 * layout and which pre-computed piece to show.
 *
 * The goal link ("Set your goals" / "Edit goals") renders whenever a caller
 * supplies onSetGoal AND SHOW_GOAL_LINK is true, in BOTH goal states. It is
 * the only route into the My Goals screen (/sales/plan) anywhere in the app,
 * so once re-enabled it must stay reachable even after a goal has been set,
 * not just before. Currently SHOW_GOAL_LINK is false, so My Goals has no UI
 * entry point at all (see SHOW_GOAL_LINK above for why).
 */
export function MetricTile(props: {
  label: string;
  value: number;
  format: "money" | "count";
  subtitle?: string;
  goal: number | null;
  pace: number;
  trend: { pct: number | null; dir: "up" | "down" | "flat" | null };
  /**
   * Which comparison basis `trend` was computed against (day/week/month/year).
   * trendLabel needs this to phrase the comparison correctly ("vs last week"
   * for a Week view, not always "vs last month") -- see display.ts.
   */
  window: Window;
  onSetGoal?: () => void;
}): JSX.Element {
  const { label, value, format, subtitle, goal, pace, trend, window, onSetGoal } = props;

  const fmt = (n: number) => (format === "money" ? fmtMoney(n) : fmtCount(n));
  const formattedValue = fmt(value);

  const fill = barFill(value, goal); // null when goal is null -> no bar
  const notch = goal !== null ? paceNotch(pace) : null;
  const trendText = trendLabel(trend.pct, trend.dir, window);

  const trendColor = trend.dir === "up" ? GREEN : trend.dir === "down" ? RED : NEUTRAL;
  const trendArrow =
    trend.dir === "up" ? "▲" : trend.dir === "down" ? "▼" : trend.dir === "flat" ? "●" : null;

  const goalLinkLabel = goal === null ? "Set your goals" : "Edit goals";

  return (
    <div
      style={{
        background: "var(--surface-default)",
        border: "1px solid var(--border-default)",
        borderRadius: 16,
        padding: "18px 22px",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {label}
          </div>
          {/* No arrow at all when dir is null: an absent prior period is not a flat or green trend. */}
          {trendArrow !== null && trendText !== null && (
            <div style={{ fontSize: 14, fontWeight: 700, color: trendColor, marginTop: 6 }}>
              {trendArrow} {trendText}
            </div>
          )}
        </div>
        <div style={{ fontSize: "clamp(30px, 4.6vw, 52px)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1, color: "var(--text-primary)", flexShrink: 0, textAlign: "right" }}>
          {formattedValue}
        </div>
      </div>

      {goal !== null && fill !== null && notch !== null && (
        <div
          role="progressbar"
          aria-valuenow={Math.round(fill * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label}: ${formattedValue} of ${fmt(goal)} goal, ${Math.round(fill * 100)} percent reached`}
          style={{
            position: "relative",
            height: 10,
            borderRadius: 999,
            background: TRACK,
            overflow: "hidden",
            marginTop: 16,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${fill * 100}%`,
              background: BAR,
              borderRadius: 999,
            }}
          />
          {/* Pace notch: expected progress for "today" within the period. Fill past
              the notch reads as ahead of pace, purely visual so aria-hidden. */}
          <div
            aria-hidden="true"
            title={`Expected pace: ${Math.round(notch * 100)}%`}
            style={{
              position: "absolute",
              left: `${notch * 100}%`,
              top: -1,
              bottom: -1,
              width: 2,
              background: NOTCH,
            }}
          />
        </div>
      )}

      {subtitle && <div style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 12 }}>{subtitle}</div>}

      {SHOW_GOAL_LINK && onSetGoal && (
        <button
          type="button"
          onClick={onSetGoal}
          style={{
            marginTop: 10,
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-muted)",
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          {goalLinkLabel}
        </button>
      )}
    </div>
  );
}
