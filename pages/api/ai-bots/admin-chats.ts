import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { BotChatModel } from "../../../src/lib/models/BotChat";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  const { botId, userId } = req.query;
  if (!botId) return res.status(400).json({ error: "botId required" });

  const query: any = { botId };
  if (userId) query.userId = userId;

  const chats = await BotChatModel.find(query).sort({ updatedAt: -1 });
  return res.status(200).json(chats);
}
