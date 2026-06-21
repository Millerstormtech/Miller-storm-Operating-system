import { Schema, model, models } from "mongoose";

const leaderboardEntrySchema = new Schema(
  {
    repName: { type: String, required: true },
    repExternalId: { type: String },
    inspectionCount: { type: Number, default: 0 },
    claimCount: { type: Number, default: 0 },
    revenueTotal: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const LeaderboardEntryModel =
  models.LeaderboardEntry || model("LeaderboardEntry", leaderboardEntrySchema);
