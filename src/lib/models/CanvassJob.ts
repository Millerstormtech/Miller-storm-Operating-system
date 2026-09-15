// src/lib/models/CanvassJob.ts
import { Schema, model, models } from "mongoose";

// One AccuLynx job on the Canvass Map: where it is, its stage and when. Loaded by
// scripts/canvass-jobs-backfill.ts through the pure mapper in src/lib/canvass/jobs.ts.
//
// Deliberately NOT stored: the job name (usually the homeowner's name), contacts
// and lead details (spec B8).
const canvassJobSchema = new Schema(
  {
    jobId: { type: String, required: true },
    jobNumber: { type: String, default: "" },
    branch: { type: String, default: "" }, // AccuLynx location, e.g. "DFW"
    // Absent when AccuLynx has no usable position (a null point would break the 2dsphere index).
    location: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number], default: undefined }, // [longitude, latitude]
    },
    address: {
      line: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      zip: { type: String, default: "" },
    },
    milestone: { type: String, default: "" },
    milestoneAt: { type: Date, default: null },
    jobCreatedAt: { type: Date, default: null },
    jobModifiedAt: { type: Date, default: null },
    tradeTypes: { type: [String], default: [] },
    workType: { type: String, default: "" },
    jobCategory: { type: String, default: "" },
    // The house this job sits on, when one is close enough (set by the matching step).
    homeId: { type: Schema.Types.ObjectId, default: null },
    matchMeters: { type: Number, default: null },
    loadedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

canvassJobSchema.index({ jobId: 1 }, { unique: true });
canvassJobSchema.index({ location: "2dsphere" });
canvassJobSchema.index({ homeId: 1 });

export const CanvassJobModel = models.CanvassJob || model("CanvassJob", canvassJobSchema, "canvass_jobs");
