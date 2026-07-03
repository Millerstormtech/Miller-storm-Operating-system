// src/lib/models/SyncState.ts
import { Schema, model, models } from "mongoose";

// One document PER LOCATION, key: "acculynx:<companyId>", holding that location's sync
// watermark + health. (A legacy single-location key "acculynx" may still exist from the
// pre-multi-location sync; the status endpoint reads the per-location "acculynx:*" docs.)
const syncStateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "acculynx" },
    branch: { type: String, default: "" },         // human branch label for this location
    lastSyncAt: { type: Date, default: null },     // incremental watermark
    lastFullSyncAt: { type: Date, default: null },
    lastStatus: { type: String, enum: ["ok", "partial", "failed", "never"], default: "never" },
    lastError: { type: String, default: "" },
    jobsProcessed: { type: Number, default: 0 },
    factsWritten: { type: Number, default: 0 },
    unmatchedCount: { type: Number, default: 0 },
    running: { type: Boolean, default: false },
    runStartedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const SyncStateModel =
  models.SyncState || model("SyncState", syncStateSchema);
