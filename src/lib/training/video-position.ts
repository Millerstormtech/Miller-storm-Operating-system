// How far into a training video a rep has actually watched. Pure: no DB, no
// React, no I/O -- the save endpoint and the lesson player both call this so
// they can never disagree about what "furthest point watched" means (see the
// module convention in CLAUDE.md).
//
// WHY THIS EXISTS. Until this shipped the furthest-watched point lived only in
// a local variable inside the browser's video player and was hardcoded to 0
// every time the player was built. Nothing ever sent it to the server, and
// UserProgress had nowhere to put it. Because seeking is clamped to that point,
// losing it did not merely forget a convenience: it locked the rep back to the
// very start of the video and made them rewatch a 30-minute lesson from zero
// after any interruption. Persisting it here is what makes "pick up where you
// left off" and "scrub freely up to where you got to" possible at all.
//
// completedPages stays the source of truth for WHETHER a lesson is done. This
// records only HOW FAR into each video the rep reached, which is also what lets
// a lesson be finished across several sittings instead of one unbroken run.

export type VideoPosition = { pageId: string; videoIndex: number; seconds: number };

// How close to the end counts as "watched the whole thing". Shared deliberately
// with the lesson player's end-detection window so the two cannot drift: if the
// player marks a lesson watched at duration - 3s, then a stored point inside
// that same window has to mean finished, or a rep would reopen a completed
// lesson parked on its closing frame.
export const END_TOLERANCE_SECONDS = 3;

/** A position we are willing to store, or null for anything we cannot trust. */
function usableSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function usableIndex(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function keyOf(pageId: string, videoIndex: number): string {
  return `${pageId}::${videoIndex}`;
}

/**
 * Fold one reported position into the stored list.
 *
 * - The furthest point only ever GROWS. A rep who reopens a lesson and watches
 *   the first minute again reports 60s against a stored 900s; taking the report
 *   at face value would hand back the exact bug this module exists to kill, and
 *   re-lock the seek bar to the first minute. Same reasoning as the union on
 *   completedPages in /api/progress: a client's live figure is evidence of
 *   progress, never evidence of regress.
 * - Each video in a multi-video lesson is tracked separately, so finishing the
 *   second video cannot claim credit for the first.
 * - An unusable pageId, videoIndex or seconds value is dropped rather than
 *   stored. A NaN from a player that has not loaded its metadata yet must not
 *   be able to poison a real recorded position.
 * - Duplicate stored entries (only reachable from a bad historical write) are
 *   collapsed keeping the FURTHEST point, never the last one written.
 *
 * Returns a new array; the input is never mutated.
 */
export function mergeVideoPosition(
  existing: VideoPosition[] | undefined,
  pageId: string,
  videoIndex: number,
  seconds: number
): VideoPosition[] {
  // Collapse duplicates first, so the result is clean even when the incoming
  // report is rejected below.
  const byKey = new Map<string, VideoPosition>();
  for (const entry of existing || []) {
    if (!entry || typeof entry.pageId !== "string" || !entry.pageId) continue;
    const idx = usableIndex(entry.videoIndex);
    const secs = usableSeconds(entry.seconds);
    if (idx === null || secs === null) continue;
    const key = keyOf(entry.pageId, idx);
    const prior = byKey.get(key);
    if (!prior || secs > prior.seconds) {
      byKey.set(key, { pageId: entry.pageId, videoIndex: idx, seconds: secs });
    }
  }

  const idx = usableIndex(videoIndex);
  const secs = usableSeconds(seconds);
  if (pageId && typeof pageId === "string" && idx !== null && secs !== null) {
    const key = keyOf(pageId, idx);
    const prior = byKey.get(key);
    if (!prior || secs > prior.seconds) {
      byKey.set(key, { pageId, videoIndex: idx, seconds: secs });
    }
  }

  return Array.from(byKey.values());
}

/** The furthest point watched, or 0 when this video has never been opened. */
export function findVideoPosition(
  positions: VideoPosition[] | undefined,
  pageId: string,
  videoIndex: number
): number {
  for (const entry of positions || []) {
    if (!entry || entry.pageId !== pageId || entry.videoIndex !== videoIndex) continue;
    const secs = usableSeconds(entry.seconds);
    if (secs !== null) return secs;
  }
  return 0;
}

/**
 * Where to drop the playhead when a lesson opens.
 *
 * Normally the furthest point watched. The exception is a video the rep already
 * finished: its stored point sits at the duration, and resuming there would
 * open the lesson on the closing frame with nothing left to play. A rep
 * reopening a finished video wants to watch it again, so it starts over.
 *
 * When the duration is not known yet (the player has not reported metadata) we
 * cannot tell "finished" from "nearly finished", so we resume and let the
 * player sort itself out rather than silently throwing the position away.
 */
export function resumeSecondsFor(savedSeconds: number, durationSeconds: number): number {
  const saved = usableSeconds(savedSeconds);
  if (saved === null || saved === 0) return 0;

  const duration = usableSeconds(durationSeconds);
  if (duration === null || duration === 0) return saved;

  if (saved >= duration - END_TOLERANCE_SECONDS) return 0;
  return saved;
}

/**
 * Whether the position moved far enough forward to be worth a write.
 *
 * Players fire time updates several times a second; saving every one of them
 * would put a rep watching one lesson into the hundreds of writes. Only real
 * forward progress is persisted. Scrubbing backwards never triggers a save,
 * both because it is not progress and because the merge above would discard it
 * anyway.
 */
export function shouldPersistPosition(
  lastSavedSeconds: number,
  currentSeconds: number,
  intervalSeconds = 10
): boolean {
  const last = usableSeconds(lastSavedSeconds) ?? 0;
  const current = usableSeconds(currentSeconds);
  if (current === null) return false;
  return current - last >= intervalSeconds;
}
