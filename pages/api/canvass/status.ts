// pages/api/canvass/status.ts
// The freshness line at the bottom of the Canvass Map (spec A3, B5): when the
// hail, door, job and property data were last brought in, and the day the
// colours were worked out for.
//
//   GET /api/canvass/status
//   -> { hail: { lastStormDay, loadedAt }, doors: { loadedAt }, jobs: { loadedAt }, parcels: { importedAt }, gradedOn, grid: { builtAt } }
//
// Every value is a date or null; nothing here can name a person.

import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { allowMethods, requireRole } from "../../../src/lib/auth";
import { CanvassHomeModel } from "../../../src/lib/models/CanvassHome";
import { CanvassDoorModel } from "../../../src/lib/models/CanvassDoor";
import { CanvassJobModel } from "../../../src/lib/models/CanvassJob";
import { CanvassHailCellModel } from "../../../src/lib/models/CanvassHailCell";
import { CanvassGridCellModel } from "../../../src/lib/models/CanvassGridCell";
import { CANVASS_ROLES } from "./homes";

/** The newest value of one field in a collection, or null when the collection is empty. */
async function newest<T>(model: { findOne: Function }, field: string): Promise<T | null> {
  const row = (await model.findOne({}, { [field]: 1 }).sort({ [field]: -1 }).lean()) as Record<string, T> | null;
  return row ? row[field] ?? null : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireRole(req, res, CANVASS_ROLES);
  if (!auth) return;

  await connectMongo();
  const [lastStormDay, hailLoadedAt, doorsLoadedAt, jobsLoadedAt, parcelsImportedAt, gradedOn, gridBuiltAt] = await Promise.all([
    newest<string>(CanvassHailCellModel, "stormDate"),
    newest<Date>(CanvassHailCellModel, "loadedAt"),
    newest<Date>(CanvassDoorModel, "loadedAt"),
    newest<Date>(CanvassJobModel, "loadedAt"),
    newest<Date>(CanvassHomeModel, "importedAt"),
    newest<string>(CanvassHomeModel, "gradedOn"),
    newest<Date>(CanvassGridCellModel, "builtAt"),
  ]);

  return res.status(200).json({
    hail: { lastStormDay, loadedAt: hailLoadedAt },
    doors: { loadedAt: doorsLoadedAt },
    jobs: { loadedAt: jobsLoadedAt },
    parcels: { importedAt: parcelsImportedAt },
    gradedOn: gradedOn || null,
    grid: { builtAt: gridBuiltAt },
  });
}
