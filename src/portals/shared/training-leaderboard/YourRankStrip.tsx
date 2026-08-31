import { nextCredential } from "../../../lib/training/credentials";
import { RepCard, type RepCardData } from "./RepCard";

/**
 * The logged-in ranked user, pinned above the board with the credential they
 * are closest to finishing. Same RepCard, indigo emphasis.
 */
export function YourRankStrip({
  row,
  isNarrow,
  onClick,
}: {
  row: RepCardData & { rank: number | null; coursesCompleted: number };
  /** Unused since the rank ladder was retired; kept so callers need no change. */
  totalCourses?: number;
  isNarrow: boolean;
  onClick?: () => void;
}) {
  return (
    <div data-tour="clb-rank" style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--clb-rank-label)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 5,
        }}
      >
        Your rank
      </div>
      <RepCard
        row={row}
        primaryRank={row.rank}
        isNarrow={isNarrow}
        youTag
        milestone={row.credentials ? nextCredential(row.credentials) : null}
        containerStyle={{ background: "var(--clb-rank-bg)", border: "1.5px solid var(--clb-rank-border)", marginBottom: 0 }}
        onClick={onClick}
      />
    </div>
  );
}
