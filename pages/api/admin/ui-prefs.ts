import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UiPrefsModel } from "../../../src/lib/models/UiPrefs";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();
  const { key } = req.query;

  if (!key || typeof key !== "string") {
    return res.status(400).json({ error: "key required" });
  }

  if (req.method === "GET") {
    const doc = await UiPrefsModel.findOne({ key }).lean();
    return res.status(200).json({ hiddenIds: (doc as any)?.hiddenIds || [] });
  }

  if (req.method === "POST") {
    const { hiddenIds } = req.body;
    await UiPrefsModel.findOneAndUpdate(
      { key },
      { hiddenIds },
      { upsert: true, new: true }
    );
    return res.status(200).json({ success: true });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end();
}
