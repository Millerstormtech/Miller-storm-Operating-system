import { SopFolderModel } from "../models/SopFolder";
import { type FolderNode, indexFolders, effectiveParentId, canSeeFolder, managesDocs } from "./folderTree";

// Every folder, with what the access checks need. The collection is small, so
// loading it whole per request is simpler than walking parents one query at a time.
export async function loadFolders(): Promise<FolderNode[]> {
  const rows = (await SopFolderModel.find({}, { id: 1, name: 1, parentId: 1, visibleTo: 1, _id: 0 }).lean()) as any[];
  return rows.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId ?? null, visibleTo: f.visibleTo ?? null }));
}

// Whether someone with this role may open a document filed in folderId. A
// folder that no longer exists counts as the top level, as it does on screen.
export async function canSeeDocument(role: string | null | undefined, folderId: string | null | undefined): Promise<boolean> {
  if (managesDocs(role)) return true;
  const byId = indexFolders(await loadFolders());
  return canSeeFolder(role, effectiveParentId(folderId, byId), byId);
}
