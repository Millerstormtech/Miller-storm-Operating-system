// src/lib/models/SyncState.ts
import { Schema, model, models } from "mongoose";

// Single document (key: "acculynx") holding the sync watermark + health.
const syncStateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "acculynx" },
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
