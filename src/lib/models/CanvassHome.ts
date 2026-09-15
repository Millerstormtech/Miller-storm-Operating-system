// src/lib/models/CanvassHome.ts
import { Schema, model, models } from "mongoose";

// One house on the Canvass Map, loaded from the Texas state property file
// by scripts/canvass-import-parcels.ts. Keyed by county FIPS + property id, so a
// yearly re-import updates houses in place instead of duplicating them.
//
// Deliberately NOT stored: the owner's mailing address (only the owner-lives-here
// result), and any homeowner phone or email (spec B2 and B8).
const canvassHomeSchema = new Schema(
  {
    fips: { type: String, required: true },
    propId: { type: String, required: true },
    location: {
      type: { type: String, enum: ["Point"], required: true },
      coordinates: { type: [Number], required: true }, // [longitude, latitude]
    },
    address: {
      line: { type: String, default: "" },
      city: { type: String, default: "" },
      zip: { type: String, default: "" },
    },
    ownerName: { type: String, default: "" },
    yearBuilt: { type: Number, default: null },
    yearBuiltSource: { type: String, enum: ["txgio", "dcad", "wcad"], default: null },
    ownerLivesHere: { type: Boolean, default: null },
    ownerSignalSource: { type: String, enum: ["address", "homestead"], default: null }, // null means the address comparison
    roofMaterial: { type: String, default: "" }, // Dallas only so far, from Dallas CAD
    // Storm days whose radar hail square covers this house, filled by scripts/canvass-hail-assign.ts.
    hail: { type: [{ date: String, inches: Number, _id: false }], default: [] },
    landUse: { type: String, default: "" }, // state land-use code, "A1", "E1"...
    landUseSource: { type: String, enum: ["state", "local", "district", "building"], default: null }, // how the home was recognized
    taxYear: { type: String, default: "" },
    importedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

canvassHomeSchema.index({ fips: 1, propId: 1 }, { unique: true });
canvassHomeSchema.index({ location: "2dsphere" });

export const CanvassHomeModel = models.CanvassHome || model("CanvassHome", canvassHomeSchema, "canvass_homes");
