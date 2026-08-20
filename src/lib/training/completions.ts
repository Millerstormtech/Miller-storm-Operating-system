// When each lesson was completed. Pure: no DB, no React, no I/O -- the two
// progress-writing endpoints both call this so they can never disagree about
// what a completion date means (see the module convention in CLAUDE.md).
//
// UserProgress.completedPages is a bare list of page ids with no dates, so the
// training board can only ever report all-time standing. This function feeds
// the parallel UserProgress.pageCompletions list, which records WHEN each page
// was first completed, so a genuine week/month/year training board becomes
// possible in future. completedPages stays the source of truth for whether a
// page is done; this only annotates it.
//
// Nothing can be backfilled: lessons completed before this shipped have no
// date and never will. A period-based board must therefore treat an undated
// completion as unknown, never as zero and never as "today".

export type PageCompletion = { pageId: string; completedAt: Date };

/** Milliseconds for a usable Date, or null for anything we cannot trust. */
function usableTime(value: unknown): number | null {
  if (!(value instanceof Date)) return null;
  const t = value.getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Reconcile stored completion dates against the current set of completed pages.
 *
 * - A page in `justCompletedIds` with no stored date is dated `now`.
 * - A page that already has a date KEEPS it. Re-saving a finished lesson, or a
 *   replayed request, must never move the achievement forward to today.
 * - A completed page that is NOT in `justCompletedIds` and has no stored date
 *   is left out entirely. This is the whole reason the caller must say what was
 *   just completed rather than letting us infer it from "has no date yet": on
 *   the first save after this shipped, a rep's entire back catalogue arrives
 *   undated, and dating it `now` would report every lesson they ever finished
 *   as finished today. Those dates are unrecoverable, so we record nothing.
 * - A page absent from `completedPageIds` is dropped, so these entries can
 *   never outlive the completedPages they describe (the admin Override tool
 *   can uncheck a page, and lesson cleanup pulls a moved one).
 * - An entry whose stored date is unusable is preserved AS IS rather than
 *   restamped: inventing a date would silently turn an unknown completion into
 *   one that appears to have happened today.
 *
 * Returns a new array in `completedPageIds` order; the input is never mutated.
 */
export function stampNewCompletions(
  existing: PageCompletion[] | undefined,
  completedPageIds: string[] | undefined,
  justCompletedIds: string[] | undefined,
  now: Date
): PageCompletion[] {
  // Collapse any duplicate stored entries, keeping the EARLIEST usable date.
  // A duplicate can only come from a bad historical write, and the earlier
  // date is the honest one -- letting the last one win would quietly backdate
  // or postdate the rep's real achievement depending on array order.
  const stored = new Map<string, PageCompletion>();
  for (const entry of existing || []) {
    if (!entry || typeof entry.pageId !== "string") continue;
    const prior = stored.get(entry.pageId);
    if (!prior) {
      stored.set(entry.pageId, entry);
      continue;
    }
    const priorTime = usableTime(prior.completedAt);
    const entryTime = usableTime(entry.completedAt);
    if (entryTime === null) continue;
    if (priorTime === null || entryTime < priorTime) stored.set(entry.pageId, entry);
  }

  const justCompleted = new Set(justCompletedIds || []);

  const out: PageCompletion[] = [];
  const emitted = new Set<string>();
  for (const pageId of completedPageIds || []) {
    if (typeof pageId !== "string" || emitted.has(pageId)) continue;
    emitted.add(pageId);
    const prior = stored.get(pageId);
    if (prior) {
      out.push({ pageId, completedAt: prior.completedAt });
    } else if (justCompleted.has(pageId)) {
      out.push({ pageId, completedAt: now });
    }
    // Otherwise: completed at some unknown past time. Deliberately omitted.
  }
  return out;
}
