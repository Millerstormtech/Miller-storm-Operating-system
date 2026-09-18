// src/lib/models/CanvassGridCell.ts
import { Schema, model, models } from "mongoose";

// One pre-counted square of the Canvass Map, 0.01 degree across: how many graded
// houses of each colour sit in it. Built by scripts/canvass-grid.ts after the
// nightly grading (rules in src/lib/canvass/grid.ts), read by the zoomed-out
// map so a city view sums a few thousand rows instead of counting a million
// houses. Counts only; nothing here can name a person or a house.
const canvassGridCellSchema = new Schema({
  col: { type: Number, required: true }, // floor(longitude / 0.01)
  row: { type: Number, required: true }, // floor(latitude / 0.01)
  count: { type: Number, required: true },
  green: { type: Number, default: 0 },
  yellow: { type: Number, default: 0 },
  orange: { type: Number, default: 0 },
  red: { type: Number, default: 0 },
  builtAt: { type: Date, required: true },
});

canvassGridCellSchema.index({ col: 1, row: 1 }, { unique: true });
canvassGridCellSchema.index({ builtAt: 1 }); // the nightly build drops squares from the run before

export const CanvassGridCellModel = models.CanvassGridCell || model("CanvassGridCell", canvassGridCellSchema, "canvass_grid_cells");
