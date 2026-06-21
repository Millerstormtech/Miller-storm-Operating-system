import { Schema, model, models } from "mongoose";

const uiPrefsSchema = new Schema({
  key: { type: String, required: true, unique: true },
  hiddenIds: [{ type: String }]
}, { timestamps: true });

export const UiPrefsModel = models.UiPrefs || model("UiPrefs", uiPrefsSchema);
