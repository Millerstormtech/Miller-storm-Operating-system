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
    repEmail: { type: String, default: "", index: true }, // normalized; leaderboard union join key
    repPhone: { type: String, default: "" },              // normalized 10-digit; fallback join key
    value: { type: Number, default: 0 },            // 1 for filed/won; dollars for revenue
    occurredAt: { type: Date, required: true, index: true },
    location: { type: String, default: "Unknown" }, // branch label (AccuLynx location name, cleaned)
    city: { type: String, default: "" },            // customer city (for a future DFW -> Dallas/Fort Worth split)
    sourceCompanyId: { type: String, index: true }, // AccuLynx company (location) this fact was synced from
    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

export const ScoringFactModel =
  models.ScoringFact || model("ScoringFact", scoringFactSchema);
