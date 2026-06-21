import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";

// GET /api/admin/course-progress?courseId=xxx
// Returns all users' progress for a given course
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  await connectMongo();

  const { courseId } = req.query;
  if (!courseId) return res.status(400).json({ error: "courseId required" });

  try {
    const records = await UserProgressModel.find({ courseId }).lean();
    res.status(200).json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch progress" });
  }
}
