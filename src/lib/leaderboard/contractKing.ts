// src/lib/leaderboard/contractKing.ts
// Who is "Contract King" this month: the rep with the highest Contract Amount
// in the CURRENT calendar month. A live race, not an end-of-month trophy
// (decided 2026-07-31; see the spec for the alternative that was considered).
//
// Pure: no DB, no React, no Date.now(). The caller supplies the rows for the
// month and today's date as a YYYY-MM-DD string.
//
// Ties reuse compareStanding, the board's single source of truth for ordering,
// so the crown can never disagree with the table about who is ahead.

import { compareStanding } from "./ranking";

export type KingCandidate = {
  id: string;
  name: string;
  revenue?: number;
  won?: number;
  filed?: number;
  lead?: number;
  leadsCreated?: number;
  verifiedKnocks?: number;
};

export type ContractKing = { id: string; name: string; revenue: number };

/**
 * The month's top rep by Contract Amount, or null when nobody has signed
 * anything yet. Zero and negative revenue never earn a crown: in the first
 * days of a month every rep sits at $0, and crowning the alphabetically
 * luckiest of them would be meaningless.
 */
export function pickContractKing(rows: KingCandidate[]): ContractKing | null {
  const earning = rows.filter((r) => (r.revenue ?? 0) > 0);
  if (earning.length === 0) return null;
  // Copy before sorting: callers pass the live board array.
  const [top] = [...earning].sort(compareStanding);
  return { id: top.id, name: top.name, revenue: top.revenue ?? 0 };
}

/** One place on the YTD Top Sales podium. */
export type PodiumPlace = {
  /** 1, 2 or 3. Not an array index: it is printed as gold/silver/bronze. */
  place: number;
  id: string;
  name: string;
  revenue: number;
  /**
   * Dollars behind the rep DIRECTLY ABOVE, not behind first place. Null for
   * first, which has nobody ahead of it.
   */
  behindBy: number | null;
  /** Who that is, so the UI can say "Behind Mike by $196,400". Null for first. */
  behindName: string | null;
};

/**
 * The top three by Contract Amount for whatever set of rows it is given: gold,
 * silver, bronze (decided 2026-08-14 from Jay's whiteboard; the design artifact
 * is docs/design/2026-08-13-ytd-king).
 *
 * There is NO period logic in here -- it sorts and takes three. The caller
 * decides the window by choosing which rows to pass, which is why the C-level
 * dashboard can reuse it for week and month while /api/leaderboard uses it for
 * the year. `pickYtdPodium` is kept below as the original name.
 *
 * Gaps are CHAINED on purpose. Bronze is told how far behind silver it is, not
 * how far behind gold, because the only rep third place can realistically pass
 * is the one immediately ahead. Measuring everyone to first gives second and
 * third the same target and makes third look hopeless.
 *
 * Returns FEWER than three entries when fewer than three reps have earned
 * anything, rather than padding with empty places: in the first days of a year
 * one rep may be the only one on the board, and two blank medals read as a
 * fault. Zero and negative revenue never place, the same gate the monthly crown
 * uses and for the same reason.
 *
 * Ordering reuses compareStanding, so the podium can never disagree with the
 * table underneath it about who is ahead.
 */
export function pickPodium(rows: KingCandidate[]): PodiumPlace[] {
  const earning = rows.filter((r) => (r.revenue ?? 0) > 0);
  if (earning.length === 0) return [];
  // Copy before sorting: callers pass the live board array.
  const top = [...earning].sort(compareStanding).slice(0, 3);
  return top.map((r, i) => {
    const above = i > 0 ? top[i - 1] : null;
    return {
      place: i + 1,
      id: r.id,
      name: r.name,
      revenue: r.revenue ?? 0,
      behindBy: above ? (above.revenue ?? 0) - (r.revenue ?? 0) : null,
      behindName: above ? above.name : null,
    };
  });
}

/**
 * The original name, from when the podium was only ever used for the year.
 * Kept so /api/leaderboard and its tests are untouched by the generalisation.
 */
export const pickYtdPodium = pickPodium;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-07-31" -> "July 2026". Parsed by hand: no Date, no timezone drift. */
export function kingMonthLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso);
  if (!m) return iso;
  const [, year, month] = m;
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
}
