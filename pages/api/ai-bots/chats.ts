import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { BotChatModel } from "../../../src/lib/models/BotChat";
import { requireUser, allowMethods } from "../../../src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "POST", "DELETE"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  if (req.method === "GET") {
    const { botId } = req.query;

    const query: any = { userId: auth.sub };
    if (botId) query.botId = botId;

    const chats = await BotChatModel.find(query).sort({ updatedAt: -1 }).limit(50);
    return res.status(200).json(chats);
  }

  if (req.method === "POST") {
    const { chatId, botId, userName, userEmail, title, messages } = req.body;

    const chat = await BotChatModel.findOneAndUpdate(
      { chatId },
      { chatId, botId, userId: auth.sub, userName, userEmail, userRole: auth.role, title, messages },
      { upsert: true, new: true }
    );

    return res.status(200).json(chat);
  }

  if (req.method === "DELETE") {
    const { chatId } = req.body;
    await BotChatModel.deleteOne({ chatId, userId: auth.sub });
    return res.status(200).json({ ok: true });
  }
}
