import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { connectMongo } from "../../../../src/lib/mongodb";
import { SopDocumentModel } from "../../../../src/lib/models/SopDocument";
import { requireUser, allowMethods } from "../../../../src/lib/auth";

const DOCS_DIR = path.join(process.cwd(), "private-uploads", "docs");

// The ONLY route that ever serves a doc's bytes. Any authenticated user may
// view (that's the whole point of the library), but this is deliberately NOT
// a static /public file: every request re-checks auth, and the response is
// always `Content-Disposition: inline` so the browser renders it in place
// rather than offering a Save dialog — the closest a plain HTTP response can
// get to "view only" (the PDF viewer on the client renders to a canvas for
// the same reason: an <iframe> would still expose the browser's own native
// PDF-viewer download button, which this route alone cannot prevent).
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

  const filePath = path.join(DOCS_DIR, doc.storageKey);
  // storageKey is server-generated (formidable's own temp filename), never
  // taken from client input, so this can't be path-traversed — checked anyway
  // as a second line of defense.
  if (!filePath.startsWith(DOCS_DIR) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "File missing" });
    return;
  }

  res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.fileName || "document")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(filePath).pipe(res);
}
