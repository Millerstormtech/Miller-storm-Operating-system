// src/lib/models/RepCardUser.ts
import { Schema, model, models } from "mongoose";

// A lightweight mirror of the RepCard user directory (one doc per RepCard rep),
// refreshed on every RepCard sync. Holds the office + team that RepCard assigns
// each rep — the source of truth for the leaderboard's Branch and Team columns.
// (Knock facts stay slim; this is joined in at read time by repcardUserId.)
const repCardUserSchema = new Schema(
  {
    repcardUserId: { type: String, required: true, unique: true },
    email: { type: String, default: "" },
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    officeId: { type: String, default: "" },
    office: { type: String, default: "" }, // e.g. "Fort Worth Office", "Lubbock Office"
    team: { type: String, default: "" },   // e.g. "Gunner", "Mike M.", "Lubbock Team"
    status: { type: String, default: "" },  // e.g. "ACTIVE" / "DEACTIVATE"
  },
  { timestamps: true }
);

export const RepCardUserModel =
  models.RepCardUser || model("RepCardUser", repCardUserSchema);
