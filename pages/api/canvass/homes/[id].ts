// pages/api/canvass/homes/[id].ts
// The card for one house on the Canvass Map (spec B5): address, owner name,
// colour and why, hail history, the last five knocks with the rep's name, and
// its AccuLynx jobs. What the card carries is decided in src/lib/canvass/card.ts,
// which is tested; this route only fetches and guards.
//
//   GET /api/canvass/homes/<id>  ->  HouseCard (see card.ts)
//
// A missing house and a malformed id both answer 404, so the route gives away
// nothing about which ids exist.

import type { NextApiRequest, NextApiResponse } from "next";
import mongoose from "mongoose";
import { connectMongo } from "../../../../src/lib/mongodb";
import { allowMethods, requireRole } from "../../../../src/lib/auth";
import { CanvassHomeModel } from "../../../../src/lib/models/CanvassHome";
import { CanvassDoorModel } from "../../../../src/lib/models/CanvassDoor";
import { CanvassJobModel } from "../../../../src/lib/models/CanvassJob";
import { houseCard, type CardDoor, type CardHome, type CardJob } from "../../../../src/lib/canvass/card";
import { CANVASS_ROLES } from "../homes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireRole(req, res, CANVASS_ROLES);
  if (!auth) return;

  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || !mongoose.isValidObjectId(id)) return res.status(404).json({ error: "Not found" });

  await connectMongo();
  const home = (await CanvassHomeModel.findById(id, {
    address: 1,
    ownerName: 1,
    yearBuilt: 1,
    ownerLivesHere: 1,
    roofMaterial: 1,
    hail: 1,
    grade: 1,
    gradedOn: 1,
  }).lean()) as CardHome | null;
  if (!home) return res.status(404).json({ error: "Not found" });

  const [doors, jobs] = await Promise.all([
    CanvassDoorModel.find({ homeId: home._id }, { homeId: 1, status: 1, statusAt: 1, knocks: 1, statusChanges: 1 }).lean() as Promise<CardDoor[]>,
    CanvassJobModel.find({ homeId: home._id }, { homeId: 1, milestone: 1, milestoneAt: 1 }).lean() as Promise<CardJob[]>,
  ]);

  return res.status(200).json(houseCard(home, doors, jobs));
}
