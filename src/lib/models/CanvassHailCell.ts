// src/lib/models/CanvassHailCell.ts
import { Schema, model, models } from "mongoose";

// One radar grid square (about 1 km across) that had hail of at least 0.75 inch
// on one storm day, from NOAA's MRMS 24-hour maximum estimated hail size.
// Decoded by scripts/canvass-hail/decode.py and loaded by
// scripts/canvass-hail-load.ts. Keyed by storm day and position, so reloading a
// day updates its squares instead of duplicating them.
const canvassHailCellSchema = new Schema({
  cellKey: { type: String, required: true, unique: true }, // "YYYY-MM-DD|lat|lon"
  stormDate: { type: String, required: true, index: true }, // 12:00 UTC that day to 12:00 UTC the next
  location: {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true }, // [longitude, latitude] of the square's center
  },
  mm: { type: Number, required: true }, // radar estimate as published
  inches: { type: Number, required: true }, // rounded to the quarter inch (src/lib/canvass/hail.ts)
  loadedAt: { type: Date, required: true },
});

canvassHailCellSchema.index({ location: "2dsphere" });

export const CanvassHailCellModel =
  models.CanvassHailCell || model("CanvassHailCell", canvassHailCellSchema, "canvass_hail_cells");
