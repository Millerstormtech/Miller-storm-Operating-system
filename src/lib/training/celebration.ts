// Storm Bot's course-completion celebration (spec 2026-07-24). Called by the
// two progress-save endpoints AFTER a successful save. Transition-based
// (complete flips false -> true), ranked reps only, once ever per rep per
// course, and failure-isolated: nothing in here may ever break the save.
import { CourseModel } from "../models/Course";
import { UserModel } from "../models/User";
import { UserProgressModel } from "../models/UserProgress";
import { NotificationModel } from "../models/Notification";
import ChatGroup from "../models/ChatGroup";
import ChatMessage from "../models/ChatMessage";
import { CourseCelebrationModel } from "../models/CourseCelebration";
import { sendPushNotificationToMultiple } from "../firebase-admin";
import { logToDb } from "../models/SystemLog";
import { courseStats, isRankedUser, type ProgressLike } from "./scoring";
import { celebrationMessage } from "./celebration-copy";

// The Motivation group (public, whole company), targeted by _id so renaming
// the group never breaks this. Dev verification overrides via env.
export const CELEBRATION_GROUP_ID =
  process.env.CELEBRATION_GROUP_ID || "6a5a1fe1b32567bcbf56fbb6";

// Same heavy-field strip the leaderboard uses: courseStats only needs page
// metadata (id/status/isQuiz/isFinalTest/folderId).
const COURSE_SELECT =
  "-pages.body -pages.transcript -pages.quizQuestions -pages.resourceLinks -pages.fileUrls -pages.pinnedCommunityPostUrl -quizQuestions -links";

export async function celebrateIfCourseCompleted(params: {
  userId: string;
  courseId: string;
  progressBefore: ProgressLike;
  progressAfter: ProgressLike;
}): Promise<void> {
  const { userId, courseId, progressBefore, progressAfter } = params;
  try {
    const course: any = await CourseModel.findOne({ id: courseId, status: "published" })
      .select(COURSE_SELECT)
      .lean();
    if (!course) return;

    // Transition rule: celebrate only when THIS save completed the course.
    // Historical completions (rep rewatches a video in a finished course)
    // never fire because before is already complete.
    const wasComplete = courseStats(course, progressBefore).complete;
    const isComplete = courseStats(course, progressAfter).complete;
    if (wasComplete || !isComplete) return;

    // Ranked reps only: same gate as the leaderboard, so dev/test accounts
    // and non-sales roles never celebrate.
    const user: any = await UserModel.findOne({ id: userId })
      .select("id name email role")
      .lean();
    if (!user || !isRankedUser({ role: user.role, email: user.email })) return;

    // Resolve the group BEFORE burning the once-ever ledger row: if the id is
    // misconfigured, the celebration must stay unconsumed so it can still fire
    // after the config is fixed.
    const group: any = await ChatGroup.findById(CELEBRATION_GROUP_ID).lean();
    if (!group) {
      await logToDb("error", "CELEBRATION", `Celebration group ${CELEBRATION_GROUP_ID} not found; skipping`);
      return;
    }

    // Once ever: insert the ledger row before posting. A duplicate-key error
    // means a racing save already celebrated; stop silently.
    try {
      await CourseCelebrationModel.create({
        userId,
        courseId,
        courseTitle: course.title || "",
        sentAt: new Date(),
      });
    } catch (e: any) {
      if (e && e.code === 11000) return;
      throw e;
    }

    // "That's N of M courses done": completed published courses after this
    // save, shared rule. Only runs on the rare completion event.
    const courses: any[] = await CourseModel.find({ status: "published" })
      .select(COURSE_SELECT)
      .lean();
    const progressDocs: any[] = await UserProgressModel.find({ userId })
      .select("courseId completedPages quizResults")
      .lean();
    const byCourse = new Map(progressDocs.map((p: any) => [p.courseId, p]));
    const done = courses.filter((c: any) => courseStats(c, byCourse.get(c.id)).complete).length;

    const text = celebrationMessage(user.name || user.email || "", course.title || "", done, courses.length);

    const msg: any = await ChatMessage.create({
      groupId: CELEBRATION_GROUP_ID,
      senderId: "storm-bot",
      senderName: "Storm Bot",
      senderRole: "system",
      message: text,
      messageType: "text",
    });

    // Notify + push exactly like a normal group message (group.members hold
    // Mongo _ids; the bot is not a member, so everyone gets notified).
    const memberIds: string[] = group.members || [];
    const title = `New message in ${group.name}`;
    const body = `Storm Bot: ${text.substring(0, 100)}`;
    await Promise.all(
      memberIds.map((memberId) =>
        NotificationModel.create({
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          userId: memberId,
          type: "stormchat_message",
          title,
          message: body,
          read: false,
          metadata: {
            groupId: CELEBRATION_GROUP_ID,
            groupName: group.name,
            messageId: msg._id,
          },
        })
      )
    );

    try {
      const tokenUsers: any[] = await UserModel.find({
        _id: { $in: memberIds },
        fcmToken: { $exists: true, $ne: null, $nin: ["", null] },
      }).select("fcmToken");
      const tokens = tokenUsers.map((u: any) => u.fcmToken).filter(Boolean);
      if (tokens.length > 0) {
        await sendPushNotificationToMultiple(tokens, title, body, {
          groupId: CELEBRATION_GROUP_ID,
          groupName: group.name,
          messageId: msg._id.toString(),
          type: "message",
          isDirect: "false",
        });
      }
    } catch (pushError: any) {
      await logToDb("error", "CELEBRATION", `Push failed: ${pushError?.message}`);
    }

    await logToDb(
      "info",
      "CELEBRATION",
      `🎉 Celebrated ${user.name} completing "${course.title}" (${done}/${courses.length})`
    );
  } catch (e: any) {
    // The save must never fail because of hype.
    try {
      await logToDb("error", "CELEBRATION", `Celebration failed: ${e?.message}`);
    } catch {
      console.error("[CELEBRATION] failed:", e);
    }
  }
}
