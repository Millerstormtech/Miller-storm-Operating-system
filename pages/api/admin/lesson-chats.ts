import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }

  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

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

    const chats = await collection
      .find({ userId })
      .sort({ updatedAt: -1 })
      .toArray();

    res.status(200).json(chats);
  } catch (error: any) {
    console.error("Admin lesson chats API error:", error);
    res.status(500).json({ error: error.message });
  }
}
