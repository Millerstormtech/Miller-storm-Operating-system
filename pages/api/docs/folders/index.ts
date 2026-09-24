import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../../src/lib/mongodb";
import { SopFolderModel } from "../../../../src/lib/models/SopFolder";
import { UserModel } from "../../../../src/lib/models/User";
import { requireUser, requireRole, allowMethods } from "../../../../src/lib/auth";

const UPLOAD_ROLES = ["admin", "c-level"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  await connectMongo();

  if (req.method === "GET") {
    const auth = requireUser(req, res);
    if (!auth) return;
    const folders = await SopFolderModel.find({}, { id: 1, name: 1, _id: 0 })
      .sort({ name: 1 })
      .lean();
    res.status(200).json(folders);
    return;
  }

  // POST — create a folder.
  const auth = requireRole(req, res, UPLOAD_ROLES);
  if (!auth) return;

  const name = (req.body?.name ?? "").toString().trim();
  if (!name) {
    res.status(400).json({ error: "A folder name is required" });
    return;
  }

  const creator = await UserModel.findOne({ id: auth.sub }, { name: 1, email: 1 }).lean() as any;
  const folder = await SopFolderModel.create({
    id: `sopfolder-${Date.now()}`,
    name,
    createdById: auth.sub,
    createdByName: creator?.name || creator?.email || "",
  });

  res.status(201).json({ id: folder.id, name: folder.name });
}
