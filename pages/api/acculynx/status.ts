// pages/api/acculynx/status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { SyncStateModel } from "../../../src/lib/models/SyncState";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();
  const state = await SyncStateModel.findOne({ key: "acculynx" }).lean();
  return res.status(200).json(state ?? { key: "acculynx", lastStatus: "never" });
}
