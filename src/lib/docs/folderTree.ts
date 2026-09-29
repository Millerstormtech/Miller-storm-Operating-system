// Folder-tree logic for Docs & SOPs, shared by the page and the API routes.
// Pure functions over plain arrays — no Mongoose, no React — so both sides
// agree on what "inside", "above" and "a valid move" mean.

export type FolderNode = { id: string; name: string; parentId: string | null };

export const MAX_NAME_LENGTH = 120;
export const MAX_TITLE_LENGTH = 200;

export function indexFolders(folders: FolderNode[]): Map<string, FolderNode> {
  return new Map(folders.map((f) => [f.id, f]));
}

// A parent (or a document's folder) that no longer exists counts as the top
// level, so nothing can become unreachable after a folder is deleted.
export function effectiveParentId(id: string | null | undefined, byId: Map<string, FolderNode>): string | null {
  return id && byId.has(id) ? id : null;
}

export function childFolders(folders: FolderNode[], byId: Map<string, FolderNode>, parentId: string | null): FolderNode[] {
  return folders
    .filter((f) => effectiveParentId(f.parentId, byId) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

// Top-level first, ending with the folder itself. Stops on a cycle rather than
// looping, in case bad data ever makes one.
export function pathTo(folderId: string | null, byId: Map<string, FolderNode>): FolderNode[] {
  const path: FolderNode[] = [];
  const seen = new Set<string>();
  let cur = folderId ? byId.get(folderId) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

// The folder and everything nested under it.
export function subtreeIds(folderId: string, folders: FolderNode[]): Set<string> {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

// A folder may move to the top level (null) or into any existing folder that
// isn't itself or one of its own subfolders.
export function canMoveFolder(folderId: string, targetParentId: string | null, folders: FolderNode[]): boolean {
  if (targetParentId === null) return true;
  if (!folders.some((f) => f.id === targetParentId)) return false;
  return !subtreeIds(folderId, folders).has(targetParentId);
}

// Every folder in tree order, labelled with its full path, for "move to" and
// "upload into" pickers.
export function folderOptions(folders: FolderNode[]): Array<{ id: string; label: string; depth: number }> {
  const byId = indexFolders(folders);
  const out: Array<{ id: string; label: string; depth: number }> = [];
  const visit = (parentId: string | null, prefix: string, depth: number, seen: Set<string>) => {
    for (const f of childFolders(folders, byId, parentId)) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      const label = prefix ? `${prefix} › ${f.name}` : f.name;
      out.push({ id: f.id, label, depth });
      visit(f.id, label, depth + 1, seen);
    }
  };
  visit(null, "", 0, new Set());
  return out;
}

// The folder names between a picked directory's root and a file, from a
// browser folder pick's webkitRelativePath: "Top/2024/offer.pdf" -> ["Top", "2024"].
export function relativeDirs(webkitRelativePath: string): string[] {
  const parts = (webkitRelativePath || "").split("/").map((p) => p.trim());
  return parts.slice(0, -1).filter(Boolean);
}

// A folder name or document title as stored: trimmed, internal runs of
// whitespace collapsed, capped. Null means "not acceptable" (empty).
export function cleanName(raw: unknown, max = MAX_NAME_LENGTH): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, max).trim();
  return name || null;
}
