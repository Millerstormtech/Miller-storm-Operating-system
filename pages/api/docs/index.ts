import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import { connectMongo } from "../../../src/lib/mongodb";
import { SopDocumentModel } from "../../../src/lib/models/SopDocument";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, requireRole, allowMethods } from "../../../src/lib/auth";
import { isAllowedUploadName } from "../../../src/lib/uploads/allowedTypes";

// Docs & SOPs library. Admin and C-Level upload; every role can list and view
// (see [id]/file.ts for the read-only viewer endpoint), nobody else can
// upload or delete.
//
// Files live under private-uploads/docs/ — deliberately OUTSIDE /public,
// unlike /api/upload-image's public/uploads. A public/uploads file is a
// static asset any browser can fetch by URL with no auth at all; a document
// meant to be view-only-in-app can't be stored that way, or "no download"
// would be undone by just visiting the file's own link directly.
const DOCS_DIR = path.join(process.cwd(), "private-uploads", "docs");
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

  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

  const form = formidable({
    uploadDir: DOCS_DIR,
    keepExtensions: true,
    maxFileSize: 200 * 1024 * 1024, // 200MB — comfortably above any real SOP/PDF
    allowEmptyFiles: false,
    minFileSize: 1,
    filter: ({ originalFilename }) => isAllowedUploadName(originalFilename || ""),
  });

  try {
    const { fields, files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>(
      (resolve, reject) => {
        form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
      }
    );

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
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
    const uploader = await UserModel.findOne({ id: auth.sub }, { name: 1, email: 1 }).lean() as any;

    const doc = await SopDocumentModel.create({
      id: `doc-${Date.now()}`,
      title,
      description,
      fileName: file.originalFilename || path.basename(file.filepath),
      storageKey: path.basename(file.filepath),
      mimeType: file.mimetype || "application/octet-stream",
      sizeBytes: file.size,
      uploadedById: auth.sub,
      uploadedByName: uploader?.name || uploader?.email || "",
      folderId: folderIdRaw || null,
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
    console.error("[docs] upload failed:", err);
    res.status(500).json({ error: "Upload failed" });
  }
}
