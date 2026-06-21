import type { NextApiRequest, NextApiResponse } from "next";
import mongoose from "mongoose";
import { connectMongo } from "../../../src/lib/mongodb";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await connectMongo();

  if (req.method === "GET") {
    try {
      // Count real chat sessions from chatHistory collection
      const db = mongoose.connection.db;
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }
      const chatHistories = await db.collection('chatHistory').find().toArray();
      
      // Count unique users who have chat sessions
      const uniqueUsers = new Set(chatHistories.map(chat => chat.userId));
      
      // Count total messages across all chats
      const totalMessages = chatHistories.reduce((sum, chat) => {
        return sum + (chat.messages?.length || 0);
      }, 0);

      // Count lesson chats
      const lessonChats = await db.collection('lessonChatHistory').find().toArray();
      const lessonMessages = lessonChats.reduce((sum, chat) => {
        return sum + (chat.messages?.length || 0);
      }, 0);

      const summary = {
        totalBots: 3, // AI Chat, Lesson Chat, Sales Chat
        totalSessions: chatHistories.length + lessonChats.length,
        totalMessages: totalMessages + lessonMessages,
        aiChatSessions: chatHistories.length,
        lessonChatSessions: lessonChats.length,
        uniqueUsers: uniqueUsers.size
      };

      res.status(200).json(summary);
      return;
    } catch (error) {
      console.error("Error fetching bot stats:", error);
      res.status(500).json({ 
        totalBots: 0, 
        totalSessions: 0, 
        totalMessages: 0 
      });
      return;
    }
  }

  res.setHeader("Allow", "GET");
  res.status(405).end();
}
