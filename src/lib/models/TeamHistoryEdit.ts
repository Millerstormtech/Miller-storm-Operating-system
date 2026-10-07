// src/lib/models/TeamHistoryEdit.ts
import { Schema, model, models } from "mongoose";

// Append-only log of admin edits to a rep's team history. `before` is exactly
// what an undo restores; undo is only allowed while the history still equals
// `after` (nothing changed it since).
const teamHistoryEditSchema = new Schema(
  {
    repcardUserId: { type: String, required: true, index: true },
    action: { type: String, enum: ["move-date", "add-move", "undo"], required: true },
    before: { type: Array, default: [] },
    after: { type: Array, default: [] },
    reason: { type: String, default: "" },
    byUserId: { type: String, default: "" },
    undoneBy: { type: String, default: null },
  },
  { timestamps: true }
);

export const TeamHistoryEditModel =
  models.TeamHistoryEdit || model("TeamHistoryEdit", teamHistoryEditSchema);
