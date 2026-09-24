import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../../src/lib/mongodb";
import { SopFolderModel } from "../../../../src/lib/models/SopFolder";
import { SopDocumentModel } from "../../../../src/lib/models/SopDocument";
import { requireRole, allowMethods } from "../../../../src/lib/auth";

const UPLOAD_ROLES = ["admin", "c-level"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["DELETE"])) return;
  const auth = requireRole(req, res, UPLOAD_ROLES);
  if (!auth) return;

  await connectMongo();
  const id = typeof req.query.id === "string" ? req.query.id : "";
  const folder = await SopFolderModel.findOne({ id }).lean();
  if (!folder) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Un-file every document in it back to Uncategorized — deleting a folder is
  // never deleting its contents.
  await SopDocumentModel.updateMany({ folderId: id }, { folderId: null });
  await SopFolderModel.deleteOne({ id });
  res.status(200).json({ success: true });
}
