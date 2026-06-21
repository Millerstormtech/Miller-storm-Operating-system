import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { CourseAiBotModel } from "../../../src/lib/models/CourseAiBot";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method === "GET") {
    const bots = await CourseAiBotModel.find({}).sort({ createdAt: -1 }).lean();
    return res.status(200).json(bots);
  }

  if (req.method === "POST") {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    const bot = await CourseAiBotModel.create({
      id: `cbot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
    });
    return res.status(201).json(bot);
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).end();
}
