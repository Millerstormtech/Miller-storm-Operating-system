import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { connectMongo } from "../../../../src/lib/mongodb";
import { SopDocumentModel } from "../../../../src/lib/models/SopDocument";
import { requireUser, allowMethods } from "../../../../src/lib/auth";
import { mimeTypeForName } from "../../../../src/lib/uploads/allowedTypes";
import { docsDir } from "../../../../src/lib/uploads/docsDir";
import { sendFile } from "../../../../src/lib/uploads/serveFile";
import { canSeeDocument } from "../../../../src/lib/docs/folderAccess";


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
  // A document in a folder hidden from this account type answers exactly like
  // one that doesn't exist, so a link to it reveals nothing.
  if (!doc || !(await canSeeDocument(auth.role, doc.folderId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const DOCS_DIR = docsDir();
  const filePath = path.join(DOCS_DIR, doc.storageKey);
  // storageKey is server-generated (formidable's own temp filename), never
  // taken from client input, so this can't be path-traversed — checked anyway
  // as a second line of defense.
  if (!filePath.startsWith(DOCS_DIR) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "File missing" });
    return;
  }

  // Type from the extension, never the stored mimeType: older records stored
  // whatever Content-Type the uploader's browser sent, which an uploader can
  // set to text/html and turn a "PDF" into a same-origin page. nosniff and a
  // sandbox CSP make sure nothing served here can ever run as a page either.
  sendFile(req, res, filePath, {
    "Content-Type": mimeTypeForName(doc.fileName || ""),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
    "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName || "document")}"`,
    // A document's bytes never change after upload, so the viewer may reuse
    // them — reopening a document is then instant instead of a re-download.
    "Cache-Control": "private, max-age=86400",
  });
}
