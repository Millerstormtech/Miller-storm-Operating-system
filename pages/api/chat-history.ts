import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { requireUser, allowMethods } from "../../src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "POST", "DELETE"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;
  const userId = auth.sub;

  try {
    const mongoose = await connectMongo();
    if (!mongoose) {
      return res.status(500).json({ error: "Database connection failed" });
    }
    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).json({ error: "Database not available" });
    }
    const collection = db.collection("chatHistory");

    if (req.method === "GET") {
      const chats = await collection
        .find({ userId })
        .sort({ updatedAt: -1 })
        .toArray();

      console.log(`Found ${chats.length} chats for user ${userId}`);
      return res.status(200).json(chats);
    }

    if (req.method === "POST") {
      const { chatId, title, messages } = req.body;

      const chat = {
        chatId: chatId || `chat-${Date.now()}`,
        userId,
        title: title || "New Chat",
        messages: messages || [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      console.log(`Saving chat ${chat.chatId} for user ${userId} with ${messages.length} messages`);

      const result = await collection.updateOne(
        { chatId: chat.chatId, userId },
        { $set: chat },
        { upsert: true }
      );

      console.log(`Save result:`, result);
      return res.status(200).json(chat);
    }

    if (req.method === "DELETE") {
      const { chatId } = req.body;

      if (!chatId) {
        return res.status(400).json({ error: "chatId is required" });
      }

      await collection.deleteOne({ chatId, userId });
      console.log(`Deleted chat ${chatId} for user ${userId}`);

      return res.status(200).json({ success: true });
    }
  } catch (error: any) {
    console.error("Chat history API error:", error);
    res.status(500).json({ error: error.message });
  }
}
