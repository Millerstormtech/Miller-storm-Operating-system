// src/lib/models/CanvassCountyQuality.ts
import { Schema, model, models } from "mongoose";

// One row per county per property-file import: the counts behind the admin
// data-quality table (spec A7). `suggestedStatus` comes from
// src/lib/canvass/quality.ts; `status` is the decision a person makes after
// looking, and stays null until then.
const canvassCountyQualitySchema = new Schema(
  {
    fips: { type: String, required: true },
    county: { type: String, default: "" },
    area: { type: String, default: "" }, // FW, RR, Lubbock, CC
    source: { type: String, required: true }, // e.g. "txgio-2025"
    extraSources: { type: [String], default: [] }, // fill-ins applied after the base import, e.g. "dcad-2026"
    taxYear: { type: String, default: "" },
    parcelsRead: { type: Number, default: 0 },
    repeatedRecords: { type: Number, default: 0 }, // records merged into another record with the same property id
    idField: { type: String, enum: ["Prop_ID", "GEO_ID"], default: "Prop_ID" }, // which state-file field identifies a property in this county
    idConflicts: { type: Number, default: 0 }, // records whose chosen id field came back on a different address (src/lib/canvass/propertyIds.ts)
    homes: { type: Number, default: 0 },
    withYearBuilt: { type: Number, default: 0 },
    builtBefore1990: { type: Number, default: 0 },
    withOwnerSignal: { type: Number, default: 0 },
    ownerLivesHere: { type: Number, default: 0 },
    homesFromBuildingOnly: { type: Number, default: 0 }, // guessed from a building because the county has no usable codes
    // Written by scripts/canvass-match.ts. "Nearby unmatched" = no house matched, but a loaded house of this county is within 2 km.
    doorsMatched: { type: Number, default: 0 },
    doorsNearbyUnmatched: { type: Number, default: 0 },
    jobsMatched: { type: Number, default: 0 },
    jobsNearbyUnmatched: { type: Number, default: 0 },
    flags: { type: [String], default: [] },
    suggestedStatus: { type: String, enum: ["live", "age-unknown", "review"], required: true },
    status: { type: String, enum: ["live", "age-unknown", "held-back"], default: null },
    importedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

canvassCountyQualitySchema.index({ fips: 1, source: 1 }, { unique: true });

export const CanvassCountyQualityModel =
  models.CanvassCountyQuality ||
  model("CanvassCountyQuality", canvassCountyQualitySchema, "canvass_county_quality");
