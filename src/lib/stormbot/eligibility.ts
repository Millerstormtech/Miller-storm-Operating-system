// Who and what gets celebrated. PURE ONLY: no database, no I/O, no env reads.

// A rolling window, deliberately not a calendar day. The AccuLynx sync re-reads
// deal history on every run and has a full-backfill mode, so it will regularly
// hand us a claim genuinely filed months ago. Without this rule, a backfill would
// congratulate the whole company for work done in May. Rolling also sidesteps the
// Central-vs-UTC boundary problem a calendar day would introduce.
export const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;

// "filed" = AccuLynx Prospect milestone (Claims Filed).
// "won"   = AccuLynx Approved milestone (Contracts).
// "lead" and "revenue" are tracked on the leaderboard but never announced:
// "lead" is too noisy, and "revenue" is the money half of the same event as "won",
// so celebrating it would double-post every contract.
export const CELEBRATABLE_METRICS = ["filed", "won"] as const;

export function isCelebratableMetric(metric: string): boolean {
  return (CELEBRATABLE_METRICS as readonly string[]).includes(metric);
}

// A future-dated fact is bad data, not an early win, so it is rejected rather
// than allowed through as "very fresh".
export function isFresh(occurredAt: Date, now: Date): boolean {
  const age = now.getTime() - occurredAt.getTime();
  return age >= 0 && age <= FRESHNESS_WINDOW_MS;
}

// null means the AccuLynx rep has no matched Miller Storm account. They are not
// in the chat group to see it, and the AccuLynx name snapshot can be stale or
// misspelled, so we stay silent. These already surface for manual linking via
// pages/api/acculynx/unmatched.ts.
export function isAnnounceableRep(
  user: { deleted?: boolean; suspended?: boolean } | null | undefined
): boolean {
  if (!user) return false;
  return user.deleted !== true && user.suspended !== true;
}

// Offset between the given instant's wall-clock time in `timeZone` and UTC.
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const { type, value } of dtf.formatToParts(date)) p[type] = value;
  // Some Node versions render midnight as hour "24"; normalize it.
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - date.getTime();
}

// The UTC instant at which the current calendar month began in `timeZone`.
// All five branches are in Texas, so "this month" means Central, not UTC:
// otherwise every month would roll over at 6pm or 7pm local on the last day.
export function monthStart(now: Date, timeZone = "America/Chicago"): Date {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" });
  const p: Record<string, string> = {};
  for (const { type, value } of dtf.formatToParts(now)) p[type] = value;
  // Local midnight on the 1st, first treated naively as if it were UTC...
  const naive = Date.UTC(+p.year, +p.month - 1, 1, 0, 0, 0);
  // ...then corrected by the offset actually in effect at that moment.
  return new Date(naive - tzOffsetMs(new Date(naive), timeZone));
}
