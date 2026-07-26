/** The slice of the Storage API this module needs. Injectable so the pure
 *  functions stay testable under vitest's node environment, which has no
 *  localStorage. */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

const seenKey = (tourId: string, userId: string) => `tourSeen:${tourId}:${userId}`;

/** localStorage when it exists and is reachable, otherwise null. Accessing it
 *  can throw outright in some privacy modes, so this is guarded. */
function defaultStore(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The tour version this user has already seen. 0 means never seen, which is
 *  also what a missing key, a malformed value, or unusable storage reports:
 *  when in doubt, show the tour. */
export function getSeenVersion(
  tourId: string,
  userId: string,
  store: StorageLike | null = defaultStore()
): number {
  if (!store) return 0;
  try {
    const raw = store.getItem(seenKey(tourId, userId));
    if (raw === null) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Record that this user has seen this version. Called by Done, Skip, and
 *  Escape alike: Skip means "not now", and nagging every visit is worse than
 *  a user missing a tour they declined. Never throws. */
export function markSeen(
  tourId: string,
  userId: string,
  version: number,
  store: StorageLike | null = defaultStore()
): void {
  if (!store) return;
  try {
    store.setItem(seenKey(tourId, userId), String(version));
  } catch {
    /* storage unavailable: the tour simply shows again next visit */
  }
}

export function shouldAutoStart(seenVersion: number, currentVersion: number): boolean {
  return seenVersion < currentVersion;
}
