// pages/api/repcard/status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { SyncStateModel } from "../../../src/lib/models/SyncState";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();
  const s = await SyncStateModel.findOne({ key: "repcard" }).lean();
  return res.status(200).json(
    s ?? { key: "repcard", lastStatus: "never", lastSyncAt: null, factsWritten: 0, running: false }
  );
}
