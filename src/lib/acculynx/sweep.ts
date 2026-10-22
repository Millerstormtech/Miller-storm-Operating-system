// src/lib/acculynx/sweep.ts
// Pure. The nightly deleted-job check (runDeletedJobSweep in sync.ts) looks up every
// job that holds a Contract or Contract Amount this year. AccuLynx never reports a
// deletion, and a deleted job drops out of the "modified since" pull, so without
// this its money stays on the boards forever (found 2026-10-22: a $33,000 job).
//
// A 404 normally means the job was deleted. But a wrong or swapped API key also
// answers 404 for every job, and acting on that would wipe a whole location's
// sales. So past a small number, a high share of missing jobs is treated as a
// key problem: nothing is removed and the run reports why.

export const MAX_MISSING_ALWAYS_OK = 5;   // a handful of deletions is normal
export const MAX_MISSING_SHARE = 0.1;     // above this share, suspect the key

export interface PurgePlan {
  purge: string[];
  refused: boolean;
  reason?: string;
}

export function planDeletedJobPurge(input: { checked: number; missing: string[] }): PurgePlan {
  const { checked, missing } = input;
  if (missing.length === 0) return { purge: [], refused: false };
  if (missing.length > MAX_MISSING_ALWAYS_OK && missing.length > checked * MAX_MISSING_SHARE) {
    return {
      purge: [],
      refused: true,
      reason: `${missing.length} of ${checked} jobs not found; check this location's API key before removing anything`,
    };
  }
  return { purge: [...missing], refused: false };
}
