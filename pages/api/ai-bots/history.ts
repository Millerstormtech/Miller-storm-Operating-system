import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { BotChatModel } from "../../../src/lib/models/BotChat";
import { requireRole, allowMethods } from "../../../src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "DELETE"])) return;

  const auth = requireRole(req, res, "admin");
  if (!auth) return;

  await connectMongo();

  if (req.method === "GET") {
    const { botId, userId } = req.query as { botId?: string; userId?: string };
    if (!botId) return res.status(400).json({ error: "botId required" });

    const query: any = { botId };
    if (userId) query.userId = userId;

    const chats = await BotChatModel.find(query)
      .sort({ updatedAt: -1 })
      .lean();
    return res.status(200).json(chats);
  }

  if (req.method === "DELETE") {
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ error: "chatId required" });
    await BotChatModel.deleteOne({ chatId });
    return res.status(200).json({ ok: true });
  }
}
