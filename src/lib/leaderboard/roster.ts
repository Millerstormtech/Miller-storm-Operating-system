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

import { matchAcxToRc, type AcxAgg, type RcAgg } from "./merge";

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


// A RepCard directory row, normalized by the caller (email lower/trim, 10-digit phone).
export interface DirectoryRep {
  repcardUserId: string;
  email: string;
  phone: string;
  status?: string | null;
  team?: string | null;
}

/**
 * Former reps (deactivated in RepCard) who had AccuLynx activity in the period but
 * no door knocks in it, so the knock-built roster left them off. They get a row like
 * every other former rep, with the ❌ (Youssef, 2026-10-23, after Chris Harwood's
 * January contracts showed only inside the non-rep total). Any lead, claim, contract
 * or money in the period earns the row.
 *
 * Left out on purpose:
 * - RepCard's "Management" team (owners, managers who are not sellers): their sales
 *   count in the company/branch totals only (others.ts).
 * - ACTIVE RepCard users with no knocks: never door-knockers, so not board reps.
 *
 * Matched by email or phone only, never by name, and never to a person who shares
 * an email/phone with someone already on the roster: adding a row must not make an
 * existing rep's match ambiguous and lose them their sales.
 * Returns the repcardUserIds to add to the roster.
 */
export function formerRepsWithActivity(
  acx: readonly AcxAgg[],
  roster: readonly RcAgg[],
  directory: readonly DirectoryRep[]
): string[] {
  const onRoster = matchAcxToRc(acx, roster as RcAgg[]);
  const unmatched = acx.filter(
    (a) => !onRoster.has(a.repExternalId) && (a.lead || a.filed || a.won || a.revenue)
  );
  if (unmatched.length === 0) return [];

  const rosterIds = new Set(roster.map((r) => r.repcardUserId));
  const rosterEmails = new Set(roster.map((r) => r.email).filter(Boolean));
  const rosterPhones = new Set(roster.map((r) => r.phone).filter(Boolean));
  const candidates: RcAgg[] = directory
    .filter((d) =>
      !rosterIds.has(d.repcardUserId) &&
      String(d.status || "").toUpperCase() === "DEACTIVATE" &&
      String(d.team || "").trim().toLowerCase() !== "management" &&
      !(d.email && rosterEmails.has(d.email)) &&
      !(d.phone && rosterPhones.has(d.phone))
    )
    .map((d) => ({ repcardUserId: d.repcardUserId, email: d.email, phone: d.phone, nameKey: "", name: "", branch: "", verifiedKnocks: 0 }));

  const hits = matchAcxToRc(unmatched, candidates);
  return [...new Set([...hits.values()].map((id) => id.slice(3)))];
}
