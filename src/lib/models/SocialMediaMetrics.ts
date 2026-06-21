import { Schema, model, models } from "mongoose";

const socialMediaMetricsSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    platform: { 
      type: String, 
      required: true
    },
    platformName: { type: String, required: true },
    followers: { type: Number, default: 0 },
    posts30d: { type: Number, default: 0 },
    views30d: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
    displayOrder: { type: Number, default: 0 } // Track row order
  },
  { 
    timestamps: true,
    strict: false, // Allow any additional fields for dynamic columns
    strictQuery: false // Also allow dynamic fields in queries
  }
);

export const SocialMediaMetricsModel = models.SocialMediaMetrics || model("SocialMediaMetrics", socialMediaMetricsSchema);
