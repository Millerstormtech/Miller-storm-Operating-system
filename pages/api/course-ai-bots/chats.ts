import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { BotChatHistoryModel } from "../../../src/lib/models/BotChatHistory";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method === "GET") {
    const { botId } = req.query;
    if (!botId) return res.status(400).json({ error: "botId required" });
    const chats = await BotChatHistoryModel.find({ botId }).sort({ updatedAt: -1 }).lean();
    return res.status(200).json(chats);
  }

  if (req.method === "DELETE") {
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ error: "chatId required" });
    await BotChatHistoryModel.deleteOne({ chatId });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, DELETE");
  res.status(405).end();
}
