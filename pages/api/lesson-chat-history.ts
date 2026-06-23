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
    const collection = db.collection("lessonChatHistory");

    if (req.method === "GET") {
      const { lessonTitle } = req.query;

      if (!lessonTitle) {
        return res.status(400).json({ error: "lessonTitle is required" });
      }

      const chats = await collection
        .find({ userId, lessonTitle })
        .sort({ updatedAt: -1 })
        .toArray();

      return res.status(200).json(chats);
    }

    if (req.method === "POST") {
      const { chatId, lessonTitle, title, messages } = req.body;

      if (!lessonTitle) {
        return res.status(400).json({ error: "lessonTitle is required" });
      }

      const chat = {
        chatId: chatId || `lesson-chat-${Date.now()}`,
        userId,
        lessonTitle,
        title: title || "New Chat",
        messages: messages || [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await collection.updateOne(
        { chatId: chat.chatId, userId },
        { $set: chat },
        { upsert: true }
      );

      return res.status(200).json(chat);
    }

    if (req.method === "DELETE") {
      const { chatId } = req.body;

      if (!chatId) {
        return res.status(400).json({ error: "chatId is required" });
      }

      await collection.deleteOne({ chatId, userId });

      return res.status(200).json({ success: true });
    }
  } catch (error: any) {
    console.error("Lesson chat history API error:", error);
    res.status(500).json({ error: error.message });
  }
}
