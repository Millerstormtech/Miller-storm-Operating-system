import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { connectMongo } from "../../../../src/lib/mongodb";
import { SopDocumentModel } from "../../../../src/lib/models/SopDocument";
import { SopFolderModel } from "../../../../src/lib/models/SopFolder";
import { cleanName, MAX_TITLE_LENGTH } from "../../../../src/lib/docs/folderTree";
import { requireRole, allowMethods } from "../../../../src/lib/auth";
import { docsDir } from "../../../../src/lib/uploads/docsDir";
import { previewPathFor } from "../../../../src/lib/uploads/docPreview";

const UPLOAD_ROLES = ["admin", "c-level"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["PATCH", "DELETE"])) return;
  const auth = requireRole(req, res, UPLOAD_ROLES);
  if (!auth) return;

  await connectMongo();
  const id = typeof req.query.id === "string" ? req.query.id : "";
  const doc = await SopDocumentModel.findOne({ id }).lean() as any;
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (req.method === "PATCH") {
    // Rename ({ title }) and/or move ({ folderId }, null = top level). The
    // file itself is fixed at upload time.
    const body = req.body || {};
    const update: Record<string, unknown> = {};
    if ("title" in body) {
      const title = cleanName(body.title, MAX_TITLE_LENGTH);
      if (!title) {
        res.status(400).json({ error: "A document name is required" });
        return;
      }
      update.title = title;
    }
    if ("folderId" in body) {
      const folderId = typeof body.folderId === "string" && body.folderId ? body.folderId : null;
      if (folderId && !(await SopFolderModel.exists({ id: folderId }))) {
        res.status(400).json({ error: "The destination folder no longer exists" });
        return;
      }
      update.folderId = folderId;
    }
    if (Object.keys(update).length > 0) await SopDocumentModel.updateOne({ id }, update);
    res.status(200).json({ id, title: update.title ?? doc.title, folderId: "folderId" in update ? update.folderId : doc.folderId ?? null });
    return;
  }

  await SopDocumentModel.deleteOne({ id });
  const DOCS_DIR = docsDir();
  const filePath = path.join(DOCS_DIR, doc.storageKey);
  if (filePath.startsWith(DOCS_DIR)) {
    fs.unlink(filePath, () => {}); // best-effort; the DB record is the source of truth
    fs.unlink(previewPathFor(doc.storageKey), () => {});
  }
  res.status(200).json({ success: true });
}
