import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import mongoose from "mongoose";

const WebTextSchema = new mongoose.Schema({
  title: String,
  description: String,
  createdAt: { type: Date, default: Date.now }
});

const WebText = mongoose.models.WebText || mongoose.model("WebText", WebTextSchema);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectMongo();

    if (req.method === "GET") {
      const items = await WebText.find({}).sort({ createdAt: -1 });
      return res.status(200).json(items);
    }

    if (req.method === "POST") {
      const { title, description } = req.body;
      if (!title || !description) {
        return res.status(400).json({ error: "Title and description are required" });
      }
      const item = await WebText.create({ title, description });
      return res.status(201).json(item);
    }

    if (req.method === "DELETE") {
      const { id } = req.query;
      if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "ID is required" });
      }
      await WebText.findByIdAndDelete(id);
      return res.status(200).json({ message: "Deleted successfully" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
