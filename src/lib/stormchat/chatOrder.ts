// Applies a rep's saved manual drag-order to their StormChat list.
//
// PURE ONLY: no database. The API route (pages/api/storm-chat/groups/index.ts)
// does the DB fetch (the caller's own User.chatOrder) and passes plain arrays
// in here — this is the single source of truth for "given a saved order and
// today's recency-sorted list, what's the actual display order", so it can be
// tested without a database and can never drift between platforms (both web
// and mobile read the SAME server-computed order — neither does its own sort).
//
// Rule: anything the rep has manually placed keeps that exact relative order.
// Anything NOT in the saved order (a brand-new chat, or one from before this
// feature existed) is appended after, in whatever order it already arrived in
// (the existing "most recent message first" sort) — new activity is never
// silently buried above a list someone took the effort to arrange, but it's
// also never allowed to jump ahead of it.
export function applyCustomOrder<T extends { _id: unknown }>(items: T[], savedOrder?: string[] | null): T[] {
  if (!savedOrder || savedOrder.length === 0) return items;
  const pos = new Map(savedOrder.map((id, i) => [id, i]));
  const ordered: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (pos.has(String(item._id))) ordered.push(item);
    else rest.push(item);
  }
  ordered.sort((a, b) => pos.get(String(a._id))! - pos.get(String(b._id))!);
  return [...ordered, ...rest];
}
