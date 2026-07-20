import type { TeamStanding } from "../../../lib/training/board";
import { ProgressRing } from "./RepCard";

/**
 * Team lead extra: their team at a glance (spec §3.1). Computed client-side
 * from the rows already loaded; the full Team vs Team panel is a later slice.
 */
export function MyTeamSummary({
  summary,
  isNarrow,
}: {
  summary: TeamStanding & { teamCount: number };
  isNarrow: boolean;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#0f766e",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 5,
        }}
      >
        Your team
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "#f0fdfa",
          border: "1.5px solid #99f6e4",
          borderRadius: 12,
          padding: isNarrow ? "10px 11px" : "11px 14px",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: isNarrow ? 13 : 14, color: "#111827" }}>
            Team {summary.team}
          </div>
          <div style={{ marginTop: 3, fontSize: isNarrow ? 11 : 12, color: "#374151" }}>
            {summary.size} rep{summary.size === 1 ? "" : "s"} · team average {summary.avgPct}% · rank #{summary.rank} of {summary.teamCount} teams
          </div>
        </div>
        <ProgressRing pct={summary.avgPct} size={isNarrow ? 46 : 52} holeBg="#f0fdfa" />
      </div>
    </div>
  );
}
