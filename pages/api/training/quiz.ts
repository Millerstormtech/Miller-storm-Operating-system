// POST /api/training/quiz
// The server grades a quiz attempt from its own answer key and is the ONLY
// writer of the result (spec 2026-07-26 §4). No score or verdict is accepted
// from the caller: the body carries answers only.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { CourseModel } from "../../../src/lib/models/Course";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { gradeQuizAttempt, toLearnerReview } from "../../../src/lib/training/quiz-grading";
import { celebrateIfCourseCompleted } from "../../../src/lib/training/celebration";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  const { courseId, pageId, answers } = req.body || {};
  if (typeof courseId !== "string" || !courseId || typeof pageId !== "string" || !pageId) {
    return res.status(400).json({ error: "courseId and pageId are required" });
  }
  if (
    !answers ||
    typeof answers !== "object" ||
    Array.isArray(answers) ||
    Object.values(answers).some((v) => typeof v !== "number")
  ) {
    return res.status(400).json({ error: "answers must be an object of questionId to option index" });
  }

  await connectMongo();

  // Keep quizQuestions (the answer key is needed HERE, server-side); drop only
  // the heavy per-page content.
  const course: any = await CourseModel.findOne({ id: courseId, status: "published" })
    .select(
      "-pages.body -pages.transcript -pages.resourceLinks -pages.fileUrls -pages.pinnedCommunityPostUrl -links"
    )
    .lean();
  if (!course) return res.status(404).json({ error: "Not found" });

  const page = (course.pages || []).find((p: any) => p.id === pageId);
  const publishedFolders = new Set(
    (course.folders || []).filter((f: any) => f.status === "published").map((f: any) => f.id)
  );
  const visible =
    !!page &&
    page.status === "published" &&
    !!page.isQuiz &&
    (!page.folderId || publishedFolders.has(page.folderId));
  if (!visible) return res.status(404).json({ error: "Not found" });

  const grade = gradeQuizAttempt(page, answers);

  if (grade.passed) {
    // Self only: a quiz pass must be earned, so the target is always the
    // authenticated caller and never a body-supplied user id.
    const userId = auth.sub;
    const entry = {
      pageId,
      answers,
      score: { correct: grade.correct, total: grade.total },
      passed: true,
      // Which of their own answers were right, so reopening this quiz later can
      // still mark the attempt. Never carries the correct option.
      review: toLearnerReview(grade.review),
      submittedAt: new Date(),
    };
    // Snapshot before the write, for the celebration's transition check. Read
    // here rather than reusing anything above: this endpoint writes with
    // updateOne, so there is no in-memory document to compare against.
    const progressBefore: any = await UserProgressModel.findOne({ userId, courseId }).lean();

    // Two atomic operations instead of read-modify-write (which loses
    // concurrent updates): remove any prior entry for this page, then add the
    // new one. A double submit therefore converges on exactly one entry.
    await UserProgressModel.updateOne({ userId, courseId }, { $pull: { quizResults: { pageId } } });
    await UserProgressModel.updateOne(
      { userId, courseId },
      { $push: { quizResults: entry } },
      { upsert: true }
    );

    // Storm Bot celebration. Passing a course's final quiz is now the most
    // common way to finish a course on the web, and this endpoint is the only
    // writer of that pass, so without this hook the celebration would silently
    // never fire for it. Fire-and-forget: the helper fans out 70+
    // notifications and must not slow the rep's submit.
    //
    // Always self-earned here: userId is auth.sub, never body-supplied.
    const progressAfter: any = await UserProgressModel.findOne({ userId, courseId }).lean();
    celebrateIfCourseCompleted({
      userId,
      courseId,
      progressBefore,
      progressAfter,
    }).catch(() => {});
  }

  return res.status(200).json({
    passed: grade.passed,
    score: { correct: grade.correct, total: grade.total },
    pct: grade.pct,
    // The learner is told which of THEIR answers were right, never what the
    // right answer was: otherwise one throwaway attempt would return the whole
    // answer key and make the retake trivial.
    review: toLearnerReview(grade.review),
  });
}
