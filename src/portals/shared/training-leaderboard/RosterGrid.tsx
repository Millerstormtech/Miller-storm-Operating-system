import type { OverallRow, BoardFilters } from "../../../lib/training/board";
import { filterRows, filtersActive } from "../../../lib/training/board";
import { RepCard } from "./RepCard";
import { NotStartedGroup } from "./NotStartedGroup";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 6px" }}>
      {children}
    </div>
  );
}

/**
 * The Overall list. Unfiltered: Top 3 with medals, then everyone else by
 * company rank. Filtered: one list with local ranks 1..N plus a small
 * "co.#X" true company rank. Medals NEVER appear in a filtered list: they
 * always mean the company-wide top 3 (spec §3.0.1).
 */
export function RosterGrid({
  rows,
  notStartedRows,
  filters,
  isNarrow,
  youId,
  onOpenRep,
}: {
  rows: OverallRow[];
  notStartedRows: OverallRow[];
  filters: BoardFilters;
  isNarrow: boolean;
  youId: string | null;
  onOpenRep: (id: string) => void;
}) {
  const active = filtersActive(filters);
  const visible = filterRows(rows, filters);
  const visibleNotStarted = filterRows(notStartedRows, filters);

  if (visible.length === 0 && visibleNotStarted.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
        {active ? "No reps match these filters." : "No reps on the board yet."}
      </div>
    );
  }

  if (active) {
    return (
      <div>
        <SectionLabel>Results</SectionLabel>
        {visible.map((r, i) => (
          <RepCard
            key={r.id}
            row={r}
            primaryRank={i + 1}
            coRank={r.rank}
            isNarrow={isNarrow}
            youTag={r.id === youId}
            onClick={() => onOpenRep(r.id)}
          />
        ))}
        <NotStartedGroup rows={visibleNotStarted} isNarrow={isNarrow} onOpenRep={onOpenRep} />
      </div>
    );
  }

  const top3 = visible.slice(0, 3);
  const rest = visible.slice(3);
  return (
    <div>
      {top3.length > 0 && <SectionLabel>Top 3</SectionLabel>}
      {top3.map((r) => (
        <RepCard key={r.id} row={r} primaryRank={r.rank} medal isNarrow={isNarrow} youTag={r.id === youId} onClick={() => onOpenRep(r.id)} />
      ))}
      {rest.length > 0 && <SectionLabel>All reps</SectionLabel>}
      {rest.map((r) => (
        <RepCard key={r.id} row={r} primaryRank={r.rank} isNarrow={isNarrow} youTag={r.id === youId} onClick={() => onOpenRep(r.id)} />
      ))}
      <NotStartedGroup rows={visibleNotStarted} isNarrow={isNarrow} onOpenRep={onOpenRep} />
    </div>
  );
}
