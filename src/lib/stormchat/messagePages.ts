// How an open chat keeps its message list when it loads in pages (readiness
// test item 12): the screen holds the newest page plus any older pages the
// person scrolled up to, and every few seconds refreshes only the newest page.
// Pure so the merge rules are unit-tested.

export type PagedMessage = { _id: string; createdAt: string | Date };

const t = (m: PagedMessage) => new Date(m.createdAt).getTime();

/** Chat order: oldest first; equal timestamps broken by id. */
export function compareMessages(a: PagedMessage, b: PagedMessage): number {
  return t(a) - t(b) || (String(a._id) < String(b._id) ? -1 : String(a._id) > String(b._id) ? 1 : 0);
}

/**
 * Merge a refreshed newest page into what's on screen.
 * - If the page is shorter than a full page, it IS the whole chat.
 * - Otherwise keep the on-screen messages older than the page's first one
 *   (pages the person scrolled up to), then the fresh page. Anything on screen
 *   inside the page's range but missing from it was deleted, so it drops out;
 *   reactions/pins/votes inside the range come from the fresh copy.
 */
export function mergeNewestPage<M extends PagedMessage>(current: M[], newest: M[], pageSize: number): M[] {
  if (newest.length < pageSize) return newest;
  const first = newest[0];
  const older = current.filter((m) => compareMessages(m, first) < 0);
  return [...older, ...newest];
}

/** Put an older page in front of what's on screen, without duplicates. */
export function prependOlderPage<M extends PagedMessage>(current: M[], older: M[]): M[] {
  const have = new Set(current.map((m) => String(m._id)));
  return [...older.filter((m) => !have.has(String(m._id))), ...current].sort(compareMessages);
}
