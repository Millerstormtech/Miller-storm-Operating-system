import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import formidable, { multipart } from "formidable";
import fs from "fs";
import path from "path";
import { connectMongo } from "../../../src/lib/mongodb";
import { SopDocumentModel } from "../../../src/lib/models/SopDocument";
import { SopFolderModel } from "../../../src/lib/models/SopFolder";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, requireRole, allowMethods } from "../../../src/lib/auth";
import { isAllowedUploadName, mimeTypeForName, storedUploadName } from "../../../src/lib/uploads/allowedTypes";
import { docsDir } from "../../../src/lib/uploads/docsDir";

// formidable 3 error codes (FormidableError.js).
const EMPTY_FILE_ERRORS = [1008, 1010]; // smallerThanMinFileSize, noEmptyFiles
const TOO_BIG_ERRORS = [1009, 1016]; // biggerThanTotalMaxFileSize, biggerThanMaxFileSize
const NO_PARSER_ERROR = 1003; // not multipart, and only the multipart parser is enabled

// Docs & SOPs library. Admin and C-Level upload; every role can list and view
// (see [id]/file.ts for the read-only viewer endpoint), nobody else can
// upload or delete.
//
// Files live under private-uploads/docs/ (docsDir()) — deliberately OUTSIDE /public,
// unlike /api/upload-image's public/uploads. A public/uploads file is a
// static asset any browser can fetch by URL with no auth at all; a document
// meant to be view-only-in-app can't be stored that way, or "no download"
// would be undone by just visiting the file's own link directly.
const UPLOAD_ROLES = ["admin", "c-level"];

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
    externalResolver: true,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  await connectMongo();

  if (req.method === "GET") {
    const auth = requireUser(req, res);
    if (!auth) return;
    // Metadata only — never storageKey, which is an internal detail of the
    // file-serving route, not something the client needs or should see.
    const docs = await SopDocumentModel.find(
      {},
      { id: 1, title: 1, description: 1, fileName: 1, mimeType: 1, sizeBytes: 1, uploadedByName: 1, createdAt: 1, folderId: 1, _id: 0 }
    )
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(docs);
    return;
  }

  // POST — upload a new doc.
  const auth = requireRole(req, res, UPLOAD_ROLES);
  if (!auth) return;

  const DOCS_DIR = docsDir();
  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

  // formidable's filter drops a refused part silently, which used to surface
  // as a baffling "No file uploaded" — keep the refused name so the admin is
  // told the real reason.
  const refused: string[] = [];
  const written: string[] = [];
  const form = formidable({
    // Multipart only: the octet-stream parser never runs `filter`.
    // (@types/formidable still types this as string[].)
    enabledPlugins: [multipart] as unknown as string[],
    uploadDir: DOCS_DIR,
    filename: (_name, _ext, part) => storedUploadName(part.originalFilename || ""),
    maxFileSize: 200 * 1024 * 1024, // 200MB — comfortably above any real SOP/PDF
    allowEmptyFiles: false,
    minFileSize: 1,
    filter: ({ originalFilename }) => {
      const ok = isAllowedUploadName(originalFilename || "");
      if (!ok) refused.push(originalFilename || "That file");
      return ok;
    },
  });
  form.on("fileBegin", (_name, f) => written.push(f.filepath));

  try {
    const { fields, files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>(
      (resolve, reject) => {
        form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
      }
    );

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file || !isAllowedUploadName(file.originalFilename || "")) {
      if (file) fs.unlink(file.filepath, () => {});
      const name = refused[0] ?? file?.originalFilename;
      res.status(400).json({ error: name ? `"${name}" isn't an allowed file type` : "No file uploaded" });
      return;
    }
    const title = (Array.isArray(fields.title) ? fields.title[0] : fields.title || "").trim();
    if (!title) {
      fs.unlink(file.filepath, () => {});
      res.status(400).json({ error: "Title is required" });
      return;
    }
    const description = (Array.isArray(fields.description) ? fields.description[0] : fields.description || "").trim();
    const folderIdRaw = (Array.isArray(fields.folderId) ? fields.folderId[0] : fields.folderId || "").trim();
    // A folder deleted while its upload was still running must not leave
    // documents pointing at it — they'd match neither a folder nor
    // Uncategorized. File them as Uncategorized instead, the same place a
    // folder delete sends its documents.
    const folderId = folderIdRaw && (await SopFolderModel.exists({ id: folderIdRaw })) ? folderIdRaw : null;
    const uploader = await UserModel.findOne({ id: auth.sub }, { name: 1, email: 1 }).lean() as any;
    const fileName = file.originalFilename || path.basename(file.filepath);

    const doc = await SopDocumentModel.create({
      id: `doc-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      title,
      description,
      fileName,
      storageKey: path.basename(file.filepath),
      mimeType: mimeTypeForName(fileName),
      sizeBytes: file.size,
      uploadedById: auth.sub,
      uploadedByName: uploader?.name || uploader?.email || "",
      folderId,
    });

    res.status(201).json({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      uploadedByName: doc.uploadedByName,
      createdAt: doc.createdAt,
      folderId: doc.folderId,
    });
  } catch (err: any) {
    // Nothing was saved, so nothing on disk should outlive this request.
    for (const p of written) fs.unlink(p, () => {});
    if (EMPTY_FILE_ERRORS.includes(err?.code)) {
      res.status(400).json({ error: "That file is empty" });
      return;
    }
    if (TOO_BIG_ERRORS.includes(err?.code)) {
      res.status(413).json({ error: "That file is over the 200MB limit" });
      return;
    }
    if (err?.code === NO_PARSER_ERROR) {
      res.status(415).json({ error: "Uploads must be sent as multipart/form-data" });
      return;
    }
    console.error("[docs] upload failed:", err);
    res.status(500).json({ error: "Upload failed" });
  }
}
