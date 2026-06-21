import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { SystemLogModel } from "../../../src/lib/models/SystemLog";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await connectMongo();

  if (req.method === "GET") {
    try {
      const { source, level, limit = 50 } = req.query;
      const query: any = {};
      if (source) query.source = source;
      if (level) query.level = level;

      const logs = await SystemLogModel.find(query)
        .sort({ timestamp: -1 })
        .limit(Number(limit))
        .lean();

      res.status(200).json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
    return;
  }

  res.setHeader("Allow", "GET");
  res.status(405).end();
}
