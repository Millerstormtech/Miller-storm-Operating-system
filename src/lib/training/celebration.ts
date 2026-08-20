// Storm Bot's course-completion celebration (spec 2026-07-24). Called by the
// progress-save endpoints and the quiz endpoint AFTER a successful save.
// Transition-based (complete flips false -> true), ranked reps only, once ever
// per rep per course, and failure-isolated: nothing in here may ever break the save.
//
// The posting itself lives in src/lib/stormbot/announce.ts, shared with the
// claim and contract celebrations.
import { CourseModel } from "../models/Course";
import { UserModel } from "../models/User";
import { UserProgressModel } from "../models/UserProgress";
import { CourseCelebrationModel } from "../models/CourseCelebration";
import { logToDb } from "../models/SystemLog";
import { courseStats, isRankedUser, type ProgressLike } from "./scoring";
import { courseCelebrationMessage } from "../stormbot/copy";
import { announce } from "../stormbot/announce";
import { awardCertificatesIfEarned } from "./certificateAward";

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

    // Certificates ride the same event and the same gates, but deliberately
    // NOT the same ledger: they are issued BEFORE the announcement is claimed,
    // so turning Storm Bot celebrations off can never stop a rep receiving the
    // credential they earned. Failure-isolated inside; never throws.
    await awardCertificatesIfEarned({
      userId,
      userName: user.name || user.email || "",
      userEmail: user.email || "",
      courseId,
      progressBefore,
      progressAfter,
    });

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

    const text = courseCelebrationMessage(
      user.name || user.email || "",
      course.title || "",
      done,
      courses.length,
      `${userId}:${courseId}` // stable seed: this completion always renders the same closer
    );

    const posted = await announce(text);
    if (posted) {
      await logToDb(
        "info",
        "CELEBRATION",
        `🎉 Celebrated ${user.name} completing "${course.title}" (${done}/${courses.length})`
      );
    }
  } catch (e: any) {
    // The save must never fail because of hype.
    try {
      await logToDb("error", "CELEBRATION", `Celebration failed: ${e?.message}`);
    } catch {
      console.error("[CELEBRATION] failed:", e);
    }
  }
}
