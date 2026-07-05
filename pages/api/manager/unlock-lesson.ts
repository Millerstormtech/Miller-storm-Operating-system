import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { UserModel } from "../../../src/lib/models/User";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { sendPushNotificationToMultiple } from "../../../src/lib/firebase-admin";
import { requireRole, allowMethods } from "../../../src/lib/auth";

// Managers (and admins) can manually unlock lessons/quizzes for a team member
// without the member watching them. Unlocked pages are stored in the member's
// UserProgress.unlockedPages — kept SEPARATE from completedPages, so unlocking
// never counts toward progress %/leaderboard. Only actually watching the video
// marks a page completed.
//
//   GET  ?memberUserId=&courseId=   -> { completedPages, unlockedPages, quizResults }
//   POST { memberUserId, courseId, pageId | pageIds[], action: "unlock" | "lock" }
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

  // POST — unlock or re-lock one or more pages for the member.
  const { memberUserId, courseId, pageId, pageIds, action, courseName } = req.body || {};
  const pages: string[] = Array.isArray(pageIds)
    ? pageIds.filter(Boolean)
    : pageId
    ? [pageId]
    : [];
  if (!memberUserId || !courseId || pages.length === 0) {
    return res.status(400).json({ error: "memberUserId, courseId and pageId(s) are required" });
  }

  const update = action === "lock"
    ? { $pull: { unlockedPages: { $in: pages } } }
    : { $addToSet: { unlockedPages: { $each: pages } } };

  // Upsert so a member with no progress record yet can still be granted access.
  const progress = await UserProgressModel.findOneAndUpdate(
    { userId: memberUserId, courseId },
    update,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean() as any;

  // On unlock, tell the member (in-app bell + push) so they know new content is
  // available. Failures here must never fail the unlock itself.
  if (action !== "lock") {
    try {
      const count = pages.length;
      const label = count === 1 ? "a lesson/quiz" : `${count} lessons/quizzes`;
      const title = "🔓 Training Unlocked";
      const message = `Your manager unlocked ${label} for you. Please check it out!`;

      await NotificationModel.create({
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId: memberUserId,
        type: "new_training",
        title,
        message,
        read: false,
        // watchUrl lets the web bell deep-link to the training page on click;
        // courseId/pageId let the mobile app open the exact course/lesson.
        metadata: { courseId, courseName: courseName || "", pageId: pages[0], lessonId: pages[0], watchUrl: "/sales/training" },
      });

      const member = await UserModel.findOne({ id: memberUserId }, { fcmToken: 1 }).lean() as any;
      if (member?.fcmToken) {
        await sendPushNotificationToMultiple([member.fcmToken], title, message, {
          type: "new_training",
          courseId: String(courseId),
          courseName: courseName || "",
          pageId: pages[0],
        });
      }
    } catch (notifyErr) {
      console.error("[unlock-lesson] notify failed:", notifyErr);
    }
  }

  return res.status(200).json({
    success: true,
    unlockedPages: progress?.unlockedPages || [],
  });
}
