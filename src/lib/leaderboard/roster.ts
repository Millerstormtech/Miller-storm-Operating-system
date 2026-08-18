// src/lib/leaderboard/roster.ts
// Who belongs on the Sales Leaderboard roster at all. Pure: no DB, no React, no I/O.
//
// Distinct from formerRep.ts, and the difference matters:
//   - FORMER  = deactivated in RepCard. Still a real rep, still on the board, still
//               counted in totals, marked with a ❌ and hideable by the filter.
//   - DELETED = removed from RepCard outright. Not on the board at all.
//
// A deactivated rep left the company; a deleted rep was erased from the system of
// record, so there is nothing to show and no status to mark them with.

/**
 * True when a rep has door-knock history but NO row in the RepCard user directory,
 * i.e. they were deleted from RepCard rather than deactivated.
 *
 * How this happens: knock facts are permanent, but the directory mirror only ever
 * receives users that RepCard's /api/users still returns. Delete someone in RepCard
 * and they stop appearing there, while their historical knocks remain. They then sat
 * on the board forever with no branch, no team, and no way to be marked or hidden,
 * because `former` is derived from a `status` field they no longer have.
 *
 * SAFETY VALVE — why `directoryIds.size === 0` returns false:
 * an empty directory means the RepCard user sync has never successfully run (a fresh
 * environment, a restored backup, a wiped collection), NOT that every employee was
 * deleted. Without this line, that state would silently empty the entire leaderboard,
 * which is a far worse failure than showing two departed reps.
 *
 * A partial directory cannot cause a false positive: repcard/sync.ts only ever
 * UPSERTS (`bulkWrite` of `updateOne … upsert: true`) and never deletes, and it skips
 * the write entirely when the fetch returns nothing. So the mirror only grows, and a
 * flaky or half-paginated sync leaves previously-synced reps in place.
 */
export function isDeletedFromRepCard(
  repcardUserId: string,
  directoryIds: ReadonlySet<string>
): boolean {
  if (directoryIds.size === 0) return false;
  return !directoryIds.has(repcardUserId);
}
