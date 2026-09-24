import { Schema, model, models } from "mongoose";

// A folder in the Docs & SOPs library — purely organizational (a SopDocument
// carries the folderId; deleting a folder never deletes its documents, it
// just un-files them back to "Uncategorized", same convention most file
// managers use). Admin/C-Level only, same roles that can upload.
const sopFolderSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    createdById: { type: String, required: true },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export const SopFolderModel = models.SopFolder || model("SopFolder", sopFolderSchema);
