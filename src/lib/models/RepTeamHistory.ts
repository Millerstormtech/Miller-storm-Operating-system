// src/lib/models/RepTeamHistory.ts
import { Schema, model, models } from "mongoose";

// One document per RepCard rep holding their WHOLE team history, so every change
// (hourly step or admin edit) is one atomic document write: a crash can never
// leave a history half-updated. `version` guards admin edits against the hourly
// step writing the same rep at the same moment.
// Rules: src/lib/teamhistory/periods.ts. Spec: docs/superpowers/specs/2026-10-07-team-history-um-design.md.
const periodSchema = new Schema(
  {
    team: { type: String, default: "" },   // lead's full name, "" = no team
    branch: { type: String, default: "" },
    from: { type: String, required: true }, // YYYY-MM-DD Central, inclusive
    to: { type: String, default: null },    // YYYY-MM-DD inclusive; null = current
    source: { type: String, enum: ["initial", "sync", "backup", "admin"], required: true },
  },
  { _id: false }
);

const repTeamHistorySchema = new Schema(
  {
    repcardUserId: { type: String, required: true, unique: true },
    repName: { type: String, default: "" },
    repEmail: { type: String, default: "" },
    periods: { type: [periodSchema], default: [] },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const RepTeamHistoryModel =
  models.RepTeamHistory || model("RepTeamHistory", repTeamHistorySchema);
