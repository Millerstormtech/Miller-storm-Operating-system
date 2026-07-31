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
