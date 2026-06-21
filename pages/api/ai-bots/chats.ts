import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { BotChatModel } from "../../../src/lib/models/BotChat";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method === "GET") {
    const { userId, botId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    
    const query: any = { userId };
    if (botId) query.botId = botId;
    
    const chats = await BotChatModel.find(query).sort({ updatedAt: -1 }).limit(50);
    return res.status(200).json(chats);
  }

  if (req.method === "POST") {
    const { chatId, botId, userId, userName, userEmail, userRole, title, messages } = req.body;
    
    const chat = await BotChatModel.findOneAndUpdate(
      { chatId },
      { chatId, botId, userId, userName, userEmail, userRole, title, messages },
      { upsert: true, new: true }
    );
    
    return res.status(200).json(chat);
  }

  if (req.method === "DELETE") {
    const { chatId } = req.body;
    await BotChatModel.deleteOne({ chatId });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]);
  res.status(405).end();
}
