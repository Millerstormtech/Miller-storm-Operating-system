import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../../src/lib/mongodb";
import { SopFolderModel } from "../../../../src/lib/models/SopFolder";
import { SopDocumentModel } from "../../../../src/lib/models/SopDocument";
import { requireRole, allowMethods } from "../../../../src/lib/auth";
import { canMoveFolder, cleanName, cleanVisibleTo, intersectVisibleTo, type FolderNode } from "../../../../src/lib/docs/folderTree";

const UPLOAD_ROLES = ["admin", "c-level"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["PATCH", "DELETE"])) return;
  const auth = requireRole(req, res, UPLOAD_ROLES);
  if (!auth) return;

  await connectMongo();
  const id = typeof req.query.id === "string" ? req.query.id : "";
  const folder = await SopFolderModel.findOne({ id }).lean() as any;
  if (!folder) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const currentParent: string | null = folder.parentId ?? null;

  if (req.method === "PATCH") {
    // Rename ({ name }), move ({ parentId }, null = top level) and/or set who
    // can see it ({ visibleTo }).
    const body = req.body || {};
    const update: Record<string, unknown> = {};
    let name: string = folder.name;
    let parentId = currentParent;

    if ("name" in body) {
      const cleaned = cleanName(body.name);
      if (!cleaned) {
        res.status(400).json({ error: "A folder name is required" });
        return;
      }
      name = cleaned;
      update.name = cleaned;
    }
    if ("parentId" in body) {
      const target = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
      const all: FolderNode[] = ((await SopFolderModel.find({}, { id: 1, name: 1, parentId: 1, _id: 0 }).lean()) as any[])
        .map((f) => ({ id: f.id, name: f.name, parentId: f.parentId ?? null }));
      if (target && !all.some((f) => f.id === target)) {
        res.status(400).json({ error: "The destination folder no longer exists" });
        return;
      }
      if (!canMoveFolder(id, target, all)) {
        res.status(400).json({ error: "A folder can't be moved into itself or one of its own subfolders" });
        return;
      }
      parentId = target;
      update.parentId = target;
    }

    // Who can see it ({ visibleTo }: null = everyone, [] = Admin & C-Level only).
    let visibleTo: string[] | null = folder.visibleTo ?? null;
    if ("visibleTo" in body) {
      const cleaned = cleanVisibleTo(body.visibleTo);
      if (cleaned === undefined) {
        res.status(400).json({ error: "Choose who can see this folder from the listed account types" });
        return;
      }
      visibleTo = cleaned;
      update.visibleTo = cleaned;
    }

    if ("name" in update || "parentId" in update) {
      // Two same-named folders side by side would be indistinguishable.
      const clash = await SopFolderModel.findOne({ name, parentId, id: { $ne: id } }).lean();
      if (clash) {
        res.status(409).json({ error: `A folder named "${name}" already exists there` });
        return;
      }
    }
    if (Object.keys(update).length > 0) await SopFolderModel.updateOne({ id }, update);
    res.status(200).json({ id, name, parentId, visibleTo });
    return;
  }

  // DELETE. Removing a folder never removes what's in it: its documents and
  // subfolders move up into the folder that contained it (or the top level).
  // Its subfolders keep its access restriction, so deleting a restricted
  // folder can't open them up to people it was hiding them from. (Its
  // documents follow their new folder; the page warns about that first.)
  if (folder.visibleTo) {
    const children = (await SopFolderModel.find({ parentId: id }, { id: 1, visibleTo: 1, _id: 0 }).lean()) as any[];
    for (const child of children) {
      await SopFolderModel.updateOne({ id: child.id }, { visibleTo: intersectVisibleTo(child.visibleTo, folder.visibleTo) });
    }
  }
  await SopDocumentModel.updateMany({ folderId: id }, { folderId: currentParent });
  await SopFolderModel.updateMany({ parentId: id }, { parentId: currentParent });
  await SopFolderModel.deleteOne({ id });
  res.status(200).json({ success: true, movedTo: currentParent });
}
