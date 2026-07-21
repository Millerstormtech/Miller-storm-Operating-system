// src/lib/acculynx/sync-policy.ts
// Pure, import-free. Decides whether a given sync run should behave as a full
// backfill or a light incremental, based on a per-location "backfill version".
// Kept free of runtime imports so it is trivially unit-testable with `node --test`.
//
// Each AccuLynx location records (in SyncState.backfillVersion) the BACKFILL_VERSION
// it was last FULLY backfilled under. When the code's BACKFILL_VERSION is raised —
// because HOW a metric is computed changed (a new milestone->metric mapping, a
// changed stage, a revenue-field switch) — every location falls behind and the next
// sync auto-upgrades that location to a ONE-TIME backfill so history is recomputed.
// A never-backfilled location stores null/undefined, which reads as 0 and therefore
// also triggers a backfill. Because the version is stamped ONLY on a completed
// backfill (see sync.ts), a skipped/failed run leaves the location behind and it is
// retried on the next cycle — the backfill cannot be silently lost.

export type SyncMode = "incremental" | "backfill";

// True when this location has not yet been backfilled under the current code version.
export function backfillNeeded(
  storedVersion: number | null | undefined,
  codeVersion: number,
): boolean {
  return (storedVersion ?? 0) < codeVersion;
}

// Effective mode for a run:
//   - an explicitly requested backfill always wins (admin "Refresh (full)" / manual);
//   - otherwise a version gap upgrades an incremental run to a backfill (the migration),
//     but NOT in dryRun so a bounded smoke test never turns into a year-to-date pull;
//   - otherwise incremental (the normal case, including every unrelated deploy).
export function resolveSyncMode(args: {
  requestedMode: SyncMode;
  storedVersion: number | null | undefined;
  codeVersion: number;
  dryRun: boolean;
}): SyncMode {
  const { requestedMode, storedVersion, codeVersion, dryRun } = args;
  if (requestedMode === "backfill") return "backfill";
  if (!dryRun && backfillNeeded(storedVersion, codeVersion)) return "backfill";
  return "incremental";
}
