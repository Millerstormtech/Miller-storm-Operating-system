import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
      const { userId, lessonTitle } = req.query;
      
      if (!userId || !lessonTitle) {
        return res.status(400).json({ error: "userId and lessonTitle are required" });
      }

      const chats = await collection
        .find({ userId, lessonTitle })
        .sort({ updatedAt: -1 })
        .toArray();

      return res.status(200).json(chats);
    }

    if (req.method === "POST") {
      const { userId, chatId, lessonTitle, title, messages } = req.body;

      if (!userId || !lessonTitle) {
        return res.status(400).json({ error: "userId and lessonTitle are required" });
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
      const { chatId, userId } = req.body;

      if (!chatId || !userId) {
        return res.status(400).json({ error: "chatId and userId are required" });
      }

      await collection.deleteOne({ chatId, userId });

      return res.status(200).json({ success: true });
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    res.status(405).end();
  } catch (error: any) {
    console.error("Lesson chat history API error:", error);
    res.status(500).json({ error: error.message });
  }
}
