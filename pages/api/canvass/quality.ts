// pages/api/canvass/quality.ts
// The admin data-quality table (spec A7, B5): one row per county with the counts
// behind its "live", "age unknown" or "review" suggestion, and the decision a
// person made, if any. Admin only.
//
//   GET /api/canvass/quality  ->  { counties: [...] }
//
// Counts only; a county row cannot name a person.

import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { allowMethods, requireRole } from "../../../src/lib/auth";
import { CanvassCountyQualityModel } from "../../../src/lib/models/CanvassCountyQuality";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireRole(req, res, "admin");
  if (!auth) return;

  await connectMongo();
  const counties = await CanvassCountyQualityModel.find(
    {},
    {
      _id: 0,
      fips: 1,
      county: 1,
      area: 1,
      source: 1,
      extraSources: 1,
      taxYear: 1,
      parcelsRead: 1,
      repeatedRecords: 1,
      idField: 1,
      idConflicts: 1,
      homes: 1,
      withYearBuilt: 1,
      builtBefore1990: 1,
      withOwnerSignal: 1,
      ownerLivesHere: 1,
      homesFromBuildingOnly: 1,
      doorsMatched: 1,
      doorsNearbyUnmatched: 1,
      jobsMatched: 1,
      jobsNearbyUnmatched: 1,
      flags: 1,
      suggestedStatus: 1,
      status: 1,
      importedAt: 1,
    }
  )
    .sort({ area: 1, homes: -1 })
    .lean();

  return res.status(200).json({ counties });
}
