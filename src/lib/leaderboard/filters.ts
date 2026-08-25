// src/lib/leaderboard/filters.ts
// Pure, import-free. The Branch and Team filters on the Sales Leaderboard.
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
// Note this is row filtering ONLY. Since branch reporting became team-based
// (see repcard/branches.ts), a branch filter no longer rewrites any rep's
// numbers, so nothing here touches a metric.

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
