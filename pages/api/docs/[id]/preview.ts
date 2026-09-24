import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { connectMongo } from "../../../../src/lib/mongodb";
import { SopDocumentModel } from "../../../../src/lib/models/SopDocument";
import { requireUser, allowMethods } from "../../../../src/lib/auth";
import { docsDir } from "../../../../src/lib/uploads/docsDir";
import { needsPdfConversion } from "../../../../src/lib/uploads/previewTypes";
import { pdfPreviewFor } from "../../../../src/lib/uploads/docPreview";

// A PDF rendition of a Word/Excel/PowerPoint-style document, for the same
// canvas viewer PDFs use — browsers can't render these formats themselves.
// Same access rules and view-only headers as [id]/file.ts.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();
  const id = typeof req.query.id === "string" ? req.query.id : "";
  const doc = await SopDocumentModel.findOne({ id }).lean() as any;
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!needsPdfConversion(doc.fileName || "")) {
    res.status(415).json({ error: "There's no preview for this file type" });
    return;
  }

  const DOCS_DIR = docsDir();
  const sourcePath = path.join(DOCS_DIR, doc.storageKey);
  if (!sourcePath.startsWith(DOCS_DIR) || !fs.existsSync(sourcePath)) {
    res.status(404).json({ error: "File missing" });
    return;
  }

  let pdfPath: string;
  try {
    pdfPath = await pdfPreviewFor(sourcePath, doc.storageKey);
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      console.error("[docs] preview: LibreOffice (soffice) is not installed");
      res.status(503).json({ error: "Previews for this file type aren't set up on the server yet" });
      return;
    }
    console.error("[docs] preview conversion failed for", id, err);
    res.status(422).json({ error: "This document couldn't be converted for preview" });
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox");
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(pdfPath).pipe(res);
}
