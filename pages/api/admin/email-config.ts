import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { EmailConfigModel } from "../../../src/lib/models/EmailConfig";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method === "GET") {
    const configs = await EmailConfigModel.find({}).lean();
    const map: Record<string, { subject: string; body: string; status: string }> = {};
    configs.forEach((c: any) => { map[c.key] = { subject: c.subject, body: c.body, status: c.status ?? "published" }; });
    res.status(200).json(map);
    return;
  }

  if (req.method === "PUT") {
    const configs: Record<string, { subject: string; body: string; status?: string }> = req.body;
    await Promise.all(
      Object.entries(configs).map(([key, val]) =>
        EmailConfigModel.findOneAndUpdate(
          { key },
          { key, subject: val.subject, body: val.body, status: val.status ?? "published" },
          { upsert: true, new: true }
        )
      )
    );
    res.status(200).json({ success: true });
    return;
  }

  res.status(405).end();
}
