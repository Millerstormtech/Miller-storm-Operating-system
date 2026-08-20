import type { ScopeLevel } from "../../../lib/scoreboard/types";
import { fmtCount } from "../../../lib/scoreboard/display";

/**
 * "Where do I stand" -- one line, or nothing at all. `rank` is exactly what
 * src/lib/scoreboard/rollup.ts's rankFor() returns: null whenever the viewer
 * has no rank among peers (company-level scope -- execs and marketing --
 * or a self-scope viewer not present in the rep pool). This component does
 * not re-derive that judgement; a null rank means render nothing, full stop.
 *
 * `rankFor` already excludes departed ("former") reps from both the numerator
 * and the denominator, so the "of N" here is the CURRENT rep pool -- a
 * different number from the scope headcount shown elsewhere on the
 * scoreboard (which intentionally keeps departed reps because their revenue
 * is still in the total). The "reps" wording on the self scope exists
 * specifically to make that current-reps-only reading unambiguous (spec S18).
 */
export function RankStrip(props: {
  rank: { rank: number; of: number } | null;
  scopeLevel: ScopeLevel;
}): JSX.Element | null {
  const { rank, scopeLevel } = props;

  if (rank === null) return null;

  const position = fmtCount(rank.rank);
  const pool = fmtCount(rank.of);

  const text =
    scopeLevel === "self"
      ? `#${position} of ${pool} reps`
      : scopeLevel === "team"
        ? `Team #${position} of ${pool}`
        : scopeLevel === "branch"
          ? `Branch #${position} of ${pool}`
          : null; // company scope has no rank concept; rankFor already returns null for it

  if (text === null) return null;

  const isTop = rank.rank <= 3;
  const medalBg =
    rank.rank === 1
      ? "radial-gradient(circle at 40% 30%, #ffe488, #e8b923 58%, #b8860b)"
      : rank.rank === 2
        ? "radial-gradient(circle at 40% 30%, #e9edf2, #b9c0c9 60%, #8b929c)"
        : rank.rank === 3
          ? "radial-gradient(circle at 40% 30%, #f0b98a, #cd7f45 60%, #9a5a2c)"
          : "rgba(255,255,255,0.18)";  /* tokens-guard-ignore: bespoke-dark, blends to invisible over surface-default */
  const medalText = isTop ? "#3a2400" : "var(--text-inverse)";

  return (
    <div
      style={{
        background: isTop
          ? "linear-gradient(90deg, #8a0002, #c40204 55%, #7a0002)"
          : "var(--surface-default)",
        border: isTop ? "1px solid rgba(224,20,24,0.5)" : "1px solid var(--border-default)",
        borderRadius: 16,
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        boxShadow: isTop ? "0 8px 24px rgba(202,0,2,0.25)" : undefined,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: medalBg,
          color: medalText,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 900,
          fontSize: 18,
          flexShrink: 0,
          boxShadow: "inset 0 1px 2px rgba(255,255,255,0.4), 0 2px 6px rgba(0,0,0,0.3)",  /* tokens-guard-ignore: fixed-brand, metallic gloss on the medal */
        }}
      >
        {rank.rank}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: isTop ? "var(--text-inverse)" : "var(--text-primary)" }}>
        {text}
      </div>
    </div>
  );
}
