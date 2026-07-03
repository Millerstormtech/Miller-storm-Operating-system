// src/lib/models/RepCardKnockFact.ts
import { Schema, model, models } from "mongoose";

// One dated receipt per (RepCard rep, day). Re-syncing a day UPDATES its fact
// (keyed by factKey) so verified-knock counts are never double-summed.
const repCardKnockFactSchema = new Schema(
  {
    factKey: { type: String, required: true, unique: true }, // `${repcardUserId}:${YYYY-MM-DD}`
    repcardUserId: { type: String, required: true, index: true },
    repEmail: { type: String, default: "", index: true }, // normalized; join key
    repPhone: { type: String, default: "" },               // normalized 10-digit; fallback join key
    repNameSnapshot: { type: String, default: "" },
    verifiedKnocks: { type: Number, default: 0 },
    occurredAt: { type: Date, required: true, index: true }, // the day (noon UTC) — windows sum by this
    location: { type: String, default: "" },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

export const RepCardKnockFactModel =
  models.RepCardKnockFact || model("RepCardKnockFact", repCardKnockFactSchema);
