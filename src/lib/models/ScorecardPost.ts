import { Schema, model, models } from "mongoose";

// One row per Central date the nightly scorecard posted for. Unique on `date`,
// written BEFORE posting, so a PM2 restart at 22:05 cannot post twice. A failed
// post keeps its row: no retry, no catch-up (Youssef, 2026-10-14).
const scorecardPostSchema = new Schema(
  {
    date: { type: String, required: true, unique: true }, // YYYY-MM-DD Central
    sentAt: { type: Date, required: true },
    text: { type: String, default: "" },
  },
  { timestamps: true }
);

export const ScorecardPostModel = models.ScorecardPost || model("ScorecardPost", scorecardPostSchema);
