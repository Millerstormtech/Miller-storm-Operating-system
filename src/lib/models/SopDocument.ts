import { Schema, model, models } from "mongoose";

// A company document (PDF, image, etc.) in the "Docs & SOPs" library. Admins
// and C-Level upload; every other role can view but never download — see
// pages/api/docs/[id]/file.ts, which is the ONLY way the actual bytes are
// ever served (always Content-Disposition: inline, always through auth).
// storageKey never leaves the server: it is an internal filename under
// private-uploads/docs/, deliberately outside /public so nothing here is
// reachable by a guessed static URL the way /public/uploads is.
const sopDocumentSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    fileName: { type: String, required: true },   // original filename, for display
    storageKey: { type: String, required: true },  // filename on disk under private-uploads/docs/
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    uploadedById: { type: String, required: true },
    uploadedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export const SopDocumentModel = models.SopDocument || model("SopDocument", sopDocumentSchema);
