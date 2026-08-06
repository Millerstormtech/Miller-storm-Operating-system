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

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "10px 16px",
        fontSize: 14,
        fontWeight: 700,
        color: "#111827",
      }}
    >
      {text}
    </div>
  );
}
