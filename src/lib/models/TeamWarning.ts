// src/lib/models/TeamWarning.ts
import { Schema, model, models } from "mongoose";

// One document per distinct warning key ("org:team-lead-deleted:<userId>",
// "no-team-numbers:<userId>"), so each problem is emailed ONCE, not hourly.
// `active` turns off when the problem disappears; if it returns it is emailed again.
const teamWarningSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    userId: { type: String, default: "", index: true },
    kind: { type: String, default: "" },
    text: { type: String, default: "" },
    active: { type: Boolean, default: true },
    emailedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const TeamWarningModel = models.TeamWarning || model("TeamWarning", teamWarningSchema);
