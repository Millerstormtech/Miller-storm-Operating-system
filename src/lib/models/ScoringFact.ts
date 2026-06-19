// src/lib/models/ScoringFact.ts
import { Schema, model, models } from "mongoose";

// One dated "receipt" per (job, metric). Re-syncing a job UPDATES its fact
// (keyed by factKey) so nothing is ever double-counted.
const scoringFactSchema = new Schema(
  {
    factKey: { type: String, required: true, unique: true }, // `${jobId}:${metric}`
    jobId: { type: String, required: true, index: true },
    metric: { type: String, enum: ["filed", "won", "revenue"], required: true },
    repExternalId: { type: String, index: true }, // AccuLynx SalesOwner user id
    repUserId: { type: String, default: null },    // linked Miller Storm user id (nullable)
    repNameSnapshot: { type: String, default: "" }, // name shown even when unmatched
    value: { type: Number, default: 0 },            // 1 for filed/won; dollars for revenue
    occurredAt: { type: Date, required: true, index: true },
    location: { type: String, default: "Unknown" },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

export const ScoringFactModel =
  models.ScoringFact || model("ScoringFact", scoringFactSchema);
