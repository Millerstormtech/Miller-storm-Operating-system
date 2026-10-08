// pages/api/canvass/teams.ts
// The choices behind the Canvass Map's "Knocks by" filter: every branch and every
// team that appears in the team history (rules in src/lib/canvass/teamKnocks.ts).
//
//   GET /api/canvass/teams
//   -> { branches: ["Dallas", ...], teams: [{ name: "Luke Huber", branch: "Fort Worth" }, ...] }
//
// Team names are lead names, as on every board.

import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { allowMethods, requireRole } from "../../../src/lib/auth";
import { RepTeamHistoryModel } from "../../../src/lib/models/RepTeamHistory";
import { scopeOptions } from "../../../src/lib/canvass/teamKnocks";
import type { Period } from "../../../src/lib/teamhistory/periods";
import { CANVASS_ROLES } from "./homes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireRole(req, res, CANVASS_ROLES);
  if (!auth) return;

  await connectMongo();
  const histories = (await RepTeamHistoryModel.find({}, { _id: 0, periods: 1 }).lean()) as Array<{ periods: Period[] }>;
  return res.status(200).json(scopeOptions(histories.map((h) => h.periods ?? [])));
}
