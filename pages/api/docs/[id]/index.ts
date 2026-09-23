import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { connectMongo } from "../../../../src/lib/mongodb";
import { SopDocumentModel } from "../../../../src/lib/models/SopDocument";
import { requireRole, allowMethods } from "../../../../src/lib/auth";

const DOCS_DIR = path.join(process.cwd(), "private-uploads", "docs");
const UPLOAD_ROLES = ["admin", "c-level"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["DELETE"])) return;
  const auth = requireRole(req, res, UPLOAD_ROLES);
  if (!auth) return;

  await connectMongo();
  const id = typeof req.query.id === "string" ? req.query.id : "";
  const doc = await SopDocumentModel.findOne({ id }).lean() as any;
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await SopDocumentModel.deleteOne({ id });
  const filePath = path.join(DOCS_DIR, doc.storageKey);
  if (filePath.startsWith(DOCS_DIR)) {
    fs.unlink(filePath, () => {}); // best-effort; the DB record is the source of truth
  }
  res.status(200).json({ success: true });
}
