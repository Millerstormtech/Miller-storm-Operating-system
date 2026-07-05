import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { requireRole, allowMethods } from "../../../src/lib/auth";

// Managers (and admins) can manually unlock a SINGLE lesson/quiz for a team
// member without the member watching it. The unlocked page is stored in the
// member's UserProgress.unlockedPages — kept separate from completedPages, so
// unlocking never counts toward progress %/leaderboard. Only actually watching
// the video marks a page completed.
//
//   GET  ?memberUserId=&courseId=   -> { completedPages, unlockedPages, quizResults }
//   POST { memberUserId, courseId, pageId, action: "unlock" | "lock" }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;

  // Only managers or admins may unlock content for someone else.
  const auth = requireRole(req, res, ["manager", "admin"]);
  if (!auth) return;

  await connectMongo();

  if (req.method === "GET") {
    const { memberUserId, courseId } = req.query;
    if (!memberUserId || !courseId) {
      return res.status(400).json({ error: "memberUserId and courseId are required" });
    }
    const progress = await UserProgressModel.findOne({
      userId: memberUserId,
      courseId,
    }).lean() as any;
    return res.status(200).json({
      completedPages: progress?.completedPages || [],
      unlockedPages: progress?.unlockedPages || [],
      quizResults: progress?.quizResults || [],
    });
  }

  // POST — unlock or re-lock one page for the member.
  const { memberUserId, courseId, pageId, action } = req.body || {};
  if (!memberUserId || !courseId || !pageId) {
    return res.status(400).json({ error: "memberUserId, courseId and pageId are required" });
  }

  const update = action === "lock"
    ? { $pull: { unlockedPages: pageId } }
    : { $addToSet: { unlockedPages: pageId } };

  // Upsert so a member with no progress record yet can still be granted access.
  const progress = await UserProgressModel.findOneAndUpdate(
    { userId: memberUserId, courseId },
    update,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean() as any;

  return res.status(200).json({
    success: true,
    unlockedPages: progress?.unlockedPages || [],
  });
}
