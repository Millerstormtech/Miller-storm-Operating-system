import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { requireRole, allowMethods } from "../../../src/lib/auth";

// After a lesson is moved OUT of a course, drop that lesson from every user's
// progress for the SOURCE course — completed/unlocked page ids and any quiz
// result for it. Nothing is transferred to the destination course (the moved
// lesson is simply un-completed there); each course's percentage then reflects
// only the lessons it currently contains.
//
// Body: { pageId, fromCourseId }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!requireRole(req, res, "admin")) return;

  await connectMongo();

  const { pageId, fromCourseId } = req.body || {};
  if (!pageId || !fromCourseId) {
    return res.status(400).json({ error: "pageId and fromCourseId are required" });
  }

  const result = await UserProgressModel.updateMany(
    { courseId: fromCourseId },
    {
      $pull: {
        completedPages: pageId,
        unlockedPages: pageId,
        quizResults: { pageId },
      },
    }
  );

  return res.status(200).json({ ok: true, modified: (result as any).modifiedCount ?? 0 });
}
