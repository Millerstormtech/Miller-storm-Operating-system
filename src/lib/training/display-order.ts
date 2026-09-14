// The order a rep sees a course's pages in, for pure rules that care what
// comes "next" or "after" (2026-09-13): pages outside any folder first, then
// each folder's pages in folder order, then pages whose folder no longer
// exists. Mirrors orderPagesByFolder in the two training screens.
//
// PURE ONLY: no database, no React, no I/O.
export function inDisplayOrder<T extends { folderId?: string }>(
  pages: T[],
  folders: ReadonlyArray<{ id: string }>
): T[] {
  const known = new Set(folders.map((f) => f.id));
  return [
    ...pages.filter((p) => !p.folderId),
    ...folders.flatMap((f) => pages.filter((p) => p.folderId === f.id)),
    ...pages.filter((p) => p.folderId && !known.has(p.folderId)),
  ];
}
