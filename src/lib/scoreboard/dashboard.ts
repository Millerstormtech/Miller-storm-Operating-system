// The role dashboard's roll-ups: the top three inside a metric, the breakdown
// row one level below the viewer, and a rep's own month history.
//
// Pure: no database, no React, no I/O. The API route and the screen both import
// from here on purpose, so the board can never disagree with itself about who is
// leading. Same reason the leaderboard keeps its ranking rules in one module.
//
// Designed 2026-08-25 from Jay's sketch. The shape is one board at four zoom
// levels: every level shows its own totals, then breaks down into the level
// beneath it. See breakdownFor().
import type { SalesRow, Totals, ScopeLevel } from "./types";

export type Metric = "revenue" | "contracts" | "claims" | "knocks";

export const METRICS: readonly Metric[] = ["revenue", "contracts", "claims", "knocks"];

export interface Leader {
  repUserId: string | null;
  name: string;
  value: number;
}

export interface GroupBreakdown {
  key: string;
  totals: Totals;
  /** The single top rep per metric inside this group. Null when nobody scored. */
  leaders: Record<Metric, Leader | null>;
}

export interface RepLine {
  repUserId: string | null;
  name: string;
  revenue: number;
  contracts: number;
  claims: number;
  knocks: number;
  former: boolean;
}

export interface MonthLine {
  /** "2026-08", so slices sort and join without a Date round-trip. */
  key: string;
  label: string;
  revenue: number;
  contracts: number;
  claims: number;
  knocks: number;
}

export type BreakdownKind = "branch" | "team" | "rep" | "month";

function valueOf(row: SalesRow | MonthLine, metric: Metric): number {
  return metric === "revenue"
    ? row.revenue
    : metric === "contracts"
    ? row.contracts
    : metric === "claims"
    ? row.claims
    : row.knocks;
}

/**
 * What the breakdown row shows, given who is looking.
 *
 * Each level drills exactly one step down: the company breaks into branches, a
 * branch into its teams, a team into its reps. A rep has nobody below them, so
 * the row becomes their own months. That is not a filler: for one person the
 * level below is time, and "am I getting better" is the question they have.
 */
export function breakdownFor(level: ScopeLevel): BreakdownKind {
  switch (level) {
    case "company":
      return "branch";
    case "branch":
      return "team";
    case "team":
      return "rep";
    case "self":
      return "month";
  }
}

/**
 * The top `n` reps by one metric.
 *
 * Two rules, both shared with rankFor() in rollup.ts so the podium and the rank
 * can never contradict each other:
 *
 * - A former rep (deactivated in RepCard) never takes a slot. Their dollars stay
 *   in every total, because the branch really did earn them, but a departed rep
 *   cannot be the face of this month.
 * - Nobody with zero on the metric is listed. "#1 in claims: someone, 0 claims"
 *   is a false statement about the business, and an empty list is the honest
 *   rendering of a metric nobody has scored on yet.
 *
 * Ties break by name ascending so two requests a second apart never reorder the
 * podium under a reader.
 */
export function topN(rows: SalesRow[], metric: Metric, n = 3): Leader[] {
  return rows
    .filter((r) => !r.former && valueOf(r, metric) > 0)
    .map((r) => ({ repUserId: r.repUserId, name: r.name, value: valueOf(r, metric) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, n));
}

/**
 * One entry per branch (or per team), each with its own totals and its number
 * one rep in each metric.
 *
 * Rows with no group key are skipped rather than collected into a blank card:
 * an unmatched rep is a data problem to fix in the org chart, not a branch. The
 * same rep still counts in the viewer's own totals above, which are summed from
 * the unfiltered scope.
 *
 * Groups are ordered by revenue, highest first, with the key as the tie-break.
 */
export function groupBreakdown(rows: SalesRow[], level: "branch" | "team"): GroupBreakdown[] {
  const buckets = new Map<string, SalesRow[]>();
  for (const r of rows) {
    const key = (level === "branch" ? r.branch : r.team) || "";
    if (!key) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(r);
    else buckets.set(key, [r]);
  }

  const out: GroupBreakdown[] = [];
  for (const [key, group] of buckets) {
    const totals: Totals = { revenue: 0, knocks: 0, claims: 0, contracts: 0 };
    for (const r of group) {
      totals.revenue += r.revenue;
      totals.knocks += r.knocks;
      totals.claims += r.claims;
      totals.contracts += r.contracts;
    }
    const leaders = {} as Record<Metric, Leader | null>;
    for (const m of METRICS) leaders[m] = topN(group, m, 1)[0] ?? null;
    out.push({ key, totals, leaders });
  }

  return out.sort((a, b) => b.totals.revenue - a.totals.revenue || a.key.localeCompare(b.key));
}

/**
 * One row per rep, highest revenue first.
 *
 * Former reps are KEPT here and flagged, unlike on a podium. A team leader's
 * question is "who do I need to talk to", and a table that silently drops people
 * answers it wrongly. The flag lets the screen mark them without hiding them.
 */
export function repLines(rows: SalesRow[]): RepLine[] {
  return rows
    .map((r) => ({
      repUserId: r.repUserId,
      name: r.name,
      revenue: r.revenue,
      contracts: r.contracts,
      claims: r.claims,
      knocks: r.knocks,
      former: r.former,
    }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
}

/**
 * The month keys to show on a rep's board, newest first.
 *
 * Stops at January of the CURRENT year rather than running a rolling twelve
 * months back into last year. The headline directly above this table is year to
 * date, so a February board that quietly listed last November underneath it
 * would invite exactly the wrong addition.
 */
export function monthKeys(now: Date, count = 6): string[] {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-based
  const available = Math.min(count, month + 1);
  const keys: string[] = [];
  for (let i = 0; i < available; i++) {
    const m = month - i;
    keys.push(`${year}-${String(m + 1).padStart(2, "0")}`);
  }
  return keys;
}

/**
 * A rep's best FINISHED month on one metric, and how close the month in progress
 * is to beating it.
 *
 * The month in progress is excluded from the search on purpose. Including it
 * would compare it against itself and read 100% every time, which tells a rep
 * nothing. Excluding it turns the card into a target: three weeks into August,
 * "88% of your best month" is a number worth chasing.
 *
 * `pct` is capped at 100 so a record-breaking month renders a full bar rather
 * than overflowing it. Null when there is no finished month with anything on it,
 * which is the honest state for a rep in their first month.
 */
export function personalBest(
  months: MonthLine[],
  metric: Metric,
  currentKey: string
): { label: string; value: number; pct: number } | null {
  const finished = months.filter((m) => m.key !== currentKey && valueOf(m, metric) > 0);
  if (finished.length === 0) return null;

  // Ties go to the more recent month: keys sort lexicographically because they
  // are zero-padded, so a strictly-greater comparison keeps the first (newest)
  // of an equal pair when the list is newest-first.
  const best = finished.reduce((a, b) => (valueOf(b, metric) > valueOf(a, metric) ? b : a));

  const current = months.find((m) => m.key === currentKey);
  const currentValue = current ? valueOf(current, metric) : 0;
  const bestValue = valueOf(best, metric);
  const pct = Math.min(100, Math.round((currentValue / bestValue) * 100));

  return { label: best.label, value: bestValue, pct };
}
