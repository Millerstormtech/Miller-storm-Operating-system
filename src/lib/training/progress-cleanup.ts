// Removing lessons or quizzes from a course must also remove them from every
// rep's saved progress for that course. Left behind, a removed page keeps
// showing up wherever progress is read directly: a completion date that a
// period-based training board could count, a manual unlock, a pinned quiz
// subset, a saved video position.
//
// These two lists are the single source of truth for "which progress fields
// point at a page". progress-cleanup.test.ts compares them with the
// UserProgress schema and fails when a new page-keyed field is added without
// being listed here. That is exactly how videoPositions and quizPicks were
// missed by the original move-lesson cleanup.
//
// Pure functions only (no database, no React), shared by the Course Builder
// and the cleanup endpoint.

/** Progress fields that are plain arrays of page ids. */
export const PAGE_ID_ARRAY_FIELDS = ["completedPages", "unlockedPages"] as const;

/** Progress fields that are arrays of entries carrying a `pageId`. */
export const PAGE_KEYED_ENTRY_FIELDS = ["quizResults", "pageCompletions", "videoPositions", "quizPicks"] as const;

type PageIdArrayField = (typeof PAGE_ID_ARRAY_FIELDS)[number];
type PageKeyedEntryField = (typeof PAGE_KEYED_ENTRY_FIELDS)[number];

export type ProgressCleanupPull = Record<PageIdArrayField, { $in: string[] }> &
  Record<PageKeyedEntryField, { pageId: { $in: string[] } }>;

/** Page ids as strings: trimmed, non-empty, first occurrence kept. Anything else is dropped. */
export function normalizePageIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of input) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Ids of pages present in `before` and missing from `after`, in their original order. */
export function removedPageIds(
  before: ReadonlyArray<{ id?: string | null }>,
  after: ReadonlyArray<{ id?: string | null }>
): string[] {
  const kept = new Set(after.map((p) => p.id).filter((id): id is string => typeof id === "string"));
  return normalizePageIds(before.map((p) => p.id).filter((id) => typeof id === "string" && !kept.has(id)));
}

/**
 * Split the requested ids into those safe to clean and those still in the
 * course. A page that is still in the course must never lose its progress,
 * whatever the caller believes: a failed save or a stray request would
 * otherwise wipe reps' completions for a lesson they can still see.
 */
export function idsSafeToClean(
  requested: readonly string[],
  pageIdsStillInCourse: readonly string[]
): { clean: string[]; stillPresent: string[] } {
  const live = new Set(pageIdsStillInCourse);
  const clean: string[] = [];
  const stillPresent: string[] = [];
  for (const id of normalizePageIds([...requested])) {
    if (live.has(id)) stillPresent.push(id);
    else clean.push(id);
  }
  return { clean, stillPresent };
}

/** The `$pull` that removes every trace of these pages from a progress document, or null when there is nothing to remove. */
export function progressCleanupPull(pageIds: readonly string[]): ProgressCleanupPull | null {
  const ids = normalizePageIds([...pageIds]);
  if (!ids.length) return null;
  const pull = {} as ProgressCleanupPull;
  for (const field of PAGE_ID_ARRAY_FIELDS) pull[field] = { $in: ids };
  for (const field of PAGE_KEYED_ENTRY_FIELDS) pull[field] = { pageId: { $in: ids } };
  return pull;
}
