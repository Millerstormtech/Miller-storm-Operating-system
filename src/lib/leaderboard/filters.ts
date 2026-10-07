// src/lib/leaderboard/filters.ts
// Pure (imports only the pure team-history helpers). The Branch and Team filters on the Sales Leaderboard.
//
// Both are MULTI-SELECT: tick any number of branches (or teams) and the board
// shows the reps belonging to any of them. An EMPTY selection means "no filter"
// rather than "nothing matches", so the board opens showing everyone.
//
// These rules are shared by the on-screen board and the PDF export on purpose.
// The export used to describe the filter in its own words and drifted out of
// step with the screen; one source means an exported PDF can never claim a
// scope the board was not actually showing.
//
// Team history (2026-10-07): a filter CAN now change a moved rep's numbers. A rep
// who moved teams shows, under each team filter, only what they earned while on
// it. See shareForSelection(). Branch reporting itself is team-based (see
// repcard/branches.ts).

import { pickSegments, type Segment } from "../teamhistory/segments";

/** Sentinel for the "(No branch)" / "(No team)" bucket: a rep with no value set. */
export const NO_VALUE = "__none__";

/**
 * Does a rep's branch (or team) pass this selection?
 * An empty selection lets everything through.
 */
export function matchesSelection(
  value: string | null | undefined,
  selected: ReadonlySet<string>
): boolean {
  if (selected.size === 0) return true;
  // A blank value is only ever matched by the "not set" bucket, never by a real
  // branch name, so filtering to Fort Worth cannot sweep up unplaced reps.
  return selected.has(value ? value : NO_VALUE);
}

/**
 * The selection as display names, in canonical order rather than tick order, so
 * the chip and the PDF read the same on repeat runs. Anything with no canonical
 * rank sorts after the ranked entries; the "not set" bucket always comes last.
 */
export function selectedNames(
  selected: ReadonlySet<string>,
  order: Record<string, number>,
  noneLabel: string
): string[] {
  const rank = (v: string) => (v in order ? order[v] : Number.MAX_SAFE_INTEGER);
  const names = [...selected]
    .filter((v) => v !== NO_VALUE)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  if (selected.has(NO_VALUE)) names.push(noneLabel);
  return names;
}

/**
 * The filter button's label: "All branches", "Fort Worth", "2 branches".
 * One selection is named rather than counted, because "1 branch" tells the
 * reader nothing they could not already see.
 */
export function selectionChipLabel(
  names: readonly string[],
  allLabel: string,
  plural: string
): string {
  if (names.length === 0) return allLabel;
  if (names.length === 1) return names[0];
  return `${names.length} ${plural}`;
}

type BoardMetrics = { verifiedKnocks: number; leadsCreated: number; filed: number; won: number; revenue: number };
export type BoardRow = BoardMetrics & { team: string | null; branch: string; segments?: Segment[] };

/**
 * The row as the filtered board shows it, or null when it does not belong.
 * A segment must match both the branch and the team selection. Kept when the
 * rep currently matches (idle members show) or earned something in a matching
 * stretch. Shared by the board and the export.
 */
export function shareForSelection<R extends BoardRow>(
  row: R,
  branchSel: ReadonlySet<string>,
  teamSel: ReadonlySet<string>
): (R & { movedOut: { team: string; branch: string; on: string } | null; joined: { from: string } | null }) | null {
  if (branchSel.size === 0 && teamSel.size === 0) return { ...row, movedOut: null, joined: null };
  const match = (s: { team: string; branch: string }) => matchesSelection(s.branch, branchSel) && matchesSelection(s.team, teamSel);
  const segs: Segment[] = row.segments && row.segments.length
    ? row.segments
    : [{ team: row.team || "", branch: row.branch || "", from: "", to: "", verifiedKnocks: row.verifiedKnocks, leadsCreated: row.leadsCreated, filed: row.filed, won: row.won, revenue: row.revenue }];
  const { inScope, movedOut, joined } = pickSegments(segs, match);
  const current = match({ team: row.team || "", branch: row.branch || "" });
  if (inScope.length === 0 && !current) return null;
  const share: BoardMetrics = { verifiedKnocks: 0, leadsCreated: 0, filed: 0, won: 0, revenue: 0 };
  for (const s of inScope) {
    share.verifiedKnocks += s.verifiedKnocks; share.leadsCreated += s.leadsCreated;
    share.filed += s.filed; share.won += s.won; share.revenue += s.revenue;
  }
  const nonZero = share.verifiedKnocks || share.leadsCreated || share.filed || share.won || share.revenue;
  if (!current && !nonZero) return null;
  return { ...row, ...share, movedOut, joined };
}
