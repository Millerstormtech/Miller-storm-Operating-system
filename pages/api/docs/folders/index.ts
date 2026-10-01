import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { connectMongo } from "../../../../src/lib/mongodb";
import { SopFolderModel } from "../../../../src/lib/models/SopFolder";
import { UserModel } from "../../../../src/lib/models/User";
import { requireUser, requireRole, allowMethods } from "../../../../src/lib/auth";
import { cleanName, indexFolders, canSeeFolder, managesDocs } from "../../../../src/lib/docs/folderTree";
import { loadFolders } from "../../../../src/lib/docs/folderAccess";

const UPLOAD_ROLES = ["admin", "c-level"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  await connectMongo();

  if (req.method === "GET") {
    const auth = requireUser(req, res);
    if (!auth) return;
    const folders = await loadFolders();
    // Managers see every folder with its access setting; everyone else only
    // gets the folders their account type may see — a hidden folder isn't
    // just greyed out on screen, it never reaches their browser.
    if (managesDocs(auth.role)) {
      res.status(200).json(folders);
      return;
    }
    const byId = indexFolders(folders);
    res.status(200).json(
      folders
        .filter((f) => canSeeFolder(auth.role, f.id, byId))
        .map((f) => ({ id: f.id, name: f.name, parentId: f.parentId }))
    );
    return;
  }

  // POST — create a folder, at the top level or inside parentId.
  const auth = requireRole(req, res, UPLOAD_ROLES);
  if (!auth) return;

  const name = cleanName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "A folder name is required" });
    return;
  }
  const parentId: string | null = typeof req.body?.parentId === "string" && req.body.parentId ? req.body.parentId : null;
  if (parentId && !(await SopFolderModel.exists({ id: parentId }))) {
    res.status(400).json({ error: "The folder you're adding to no longer exists" });
    return;
  }

  // Reuse a same-named folder in the same place instead of creating a
  // duplicate — for a re-uploaded device folder, and for a double-submit
  // racing two creates of one new name.
  const existingFolder = await SopFolderModel.findOne({ name, parentId }).lean() as any;
  if (existingFolder) {
    res.status(200).json({ id: existingFolder.id, name: existingFolder.name, parentId: existingFolder.parentId ?? null, visibleTo: existingFolder.visibleTo ?? null });
    return;
  }

  const creator = await UserModel.findOne({ id: auth.sub }, { name: 1, email: 1 }).lean() as any;
  const folder = await SopFolderModel.create({
    id: `sopfolder-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    name,
    parentId,
    createdById: auth.sub,
    createdByName: creator?.name || creator?.email || "",
  });

  res.status(201).json({ id: folder.id, name: folder.name, parentId: folder.parentId ?? null, visibleTo: null });
}
