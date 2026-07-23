import { nextMilestone } from "../../../lib/training/board";
import { RepCard, type RepCardData } from "./RepCard";

/**
 * The logged-in ranked user, pinned above the board with their next
 * milestone. Same RepCard, indigo emphasis.
 */
export function YourRankStrip({
  row,
  totalCourses,
  isNarrow,
}: {
  row: RepCardData & { rank: number | null; coursesCompleted: number };
  totalCourses: number;
  isNarrow: boolean;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#4f46e5",
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
        milestone={nextMilestone(row.coursesCompleted, totalCourses)}
        containerStyle={{ background: "#eef2ff", border: "1.5px solid #c7d2fe", marginBottom: 0 }}
      />
    </div>
  );
}
