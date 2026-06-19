// pages/api/acculynx/unmatched.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { ScoringFactModel } from "../../../src/lib/models/ScoringFact";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();
  const rows = await ScoringFactModel.aggregate([
    { $match: { repUserId: null, repExternalId: { $ne: null } } },
    { $group: { _id: "$repExternalId", name: { $last: "$repNameSnapshot" }, facts: { $sum: 1 } } },
    { $sort: { facts: -1 } },
  ]);
  return res.status(200).json(rows.map((r: any) => ({ repExternalId: r._id, name: r.name, facts: r.facts })));
}
