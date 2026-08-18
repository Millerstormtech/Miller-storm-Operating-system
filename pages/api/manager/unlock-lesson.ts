import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { UserModel } from "../../../src/lib/models/User";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { sendPushNotificationToMultiple } from "../../../src/lib/firebase-admin";
import { requireRole, allowMethods } from "../../../src/lib/auth";
import { trainingRouteForRole } from "../../../src/lib/trainingRoute";

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

  // Only managers, admins, or C-Level execs may unlock content for someone else.
  const auth = requireRole(req, res, ["sales-team-lead", "admin", "c-level", "branch-manager"]);
  if (!auth) return;

  await connectMongo();

  // Object-level authorization: requireRole above only proves the caller is a
  // manager/admin — NOT that this member belongs to them. Without this, any
  // manager could read/modify ANY user in the company (IDOR). Admins are
  // org-wide; managers are scoped to their own team via User.managerId.
  // Target member id(s). POST accepts a single memberUserId OR memberUserIds[]
  // (bulk unlock for many reps at once); GET is always a single member.
  const memberIds: string[] = (
    req.method === "GET"
      ? [req.query.memberUserId]
      : Array.isArray(req.body?.memberUserIds) && req.body.memberUserIds.length
      ? req.body.memberUserIds
      : req.body?.memberUserId
      ? [req.body.memberUserId]
      : []
  )
    .map((v: any) => (v == null ? "" : String(v)))
    .filter(Boolean);
  if (auth.role === "sales-team-lead") {
    if (memberIds.length === 0) {
      return res.status(400).json({ error: "memberUserId is required" });
    }
    // Every target must be on this manager's team (IDOR guard, bulk-aware).
    const members = await UserModel.find({ id: { $in: memberIds } }).select("id managerId").lean() as any[];
    const notOnTeam = memberIds.some((id) => {
      const m = members.find((x) => String(x.id) === String(id));
      return !m || String(m.managerId) !== String(auth.sub);
    });
    if (notOnTeam) {
      return res.status(403).json({ error: "Forbidden: some members are not on your team" });
    }
  }

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

  // POST — unlock or re-lock one or more pages for one OR MANY members.
  const { courseId, pageId, pageIds, action, courseName } = req.body || {};
  const pages: string[] = Array.isArray(pageIds)
    ? pageIds.filter(Boolean)
    : pageId
    ? [pageId]
    : [];
  if (memberIds.length === 0 || !courseId || pages.length === 0) {
    return res.status(400).json({ error: "memberUserId(s), courseId and pageId(s) are required" });
  }

  const update = action === "lock"
    ? { $pull: { unlockedPages: { $in: pages } } }
    : { $addToSet: { unlockedPages: { $each: pages } } };

  const count = pages.length;
  const label = count === 1 ? "a lesson/quiz" : `${count} lessons/quizzes`;
  const title = "🔓 Training Unlocked";
  const message = `Your Sales Team Lead unlocked ${label} for you. Please check it out!`;

  let lastUnlockedPages: string[] = [];
  for (const uid of memberIds) {
    // Upsert so a member with no progress record yet can still be granted access.
    const progress = await UserProgressModel.findOneAndUpdate(
      { userId: uid, courseId },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean() as any;
    lastUnlockedPages = progress?.unlockedPages || [];

    // On unlock, tell the member (in-app bell + push). Per-member so each rep is
    // notified; failures never fail the unlock itself.
    if (action !== "lock") {
      try {
        const recipient = await UserModel.findOne({ id: uid }, { role: 1, fcmToken: 1 }).lean() as any;
        const watchUrl = trainingRouteForRole(recipient?.role);
        await NotificationModel.create({
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          userId: uid,
          type: "new_training",
          title,
          message,
          read: false,
          // watchUrl lets the web bell deep-link to the training page on click;
          // courseId/pageId let the mobile app open the exact course/lesson.
          metadata: { courseId, courseName: courseName || "", pageId: pages[0], lessonId: pages[0], watchUrl },
        });
        if (recipient?.fcmToken) {
          await sendPushNotificationToMultiple([recipient.fcmToken], title, message, {
            type: "new_training",
            courseId: String(courseId),
            courseName: courseName || "",
            pageId: pages[0],
          });
        }
      } catch (notifyErr) {
        console.error("[unlock-lesson] notify failed for", uid, notifyErr);
      }
    }
  }

  return res.status(200).json({
    success: true,
    count: memberIds.length,
    // Back-compat: single-member callers still read unlockedPages.
    unlockedPages: lastUnlockedPages,
  });
}
