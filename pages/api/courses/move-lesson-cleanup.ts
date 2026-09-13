import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { CourseModel } from "../../../src/lib/models/Course";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { requireRole, allowMethods } from "../../../src/lib/auth";
import {
  normalizePageIds,
  idsSafeToClean,
  progressCleanupPull,
} from "../../../src/lib/training/progress-cleanup";

// After lessons or quizzes leave a course, remove them from every user's saved
// progress for THAT course: completed and unlocked page ids, quiz results,
// completion dates, video positions and pinned quiz picks (the full list lives
// in src/lib/training/progress-cleanup.ts). The Course Builder calls this after
// MOVING a lesson to another course and after DELETING lessons or a module.
// Deleting used to skip it, which left removed pages in reps' progress.
//
// Nothing is transferred to a destination course (a moved lesson is simply
// un-completed there); each course's numbers then reflect only the lessons it
// currently contains.
//
// Safety net: a page that is STILL in the course is never cleaned, so a failed
// save or a stray request cannot wipe progress for a lesson reps can still see.
//
// Body: { fromCourseId, pageIds: string[] }. A single { pageId } is still accepted.
const MAX_PAGE_IDS = 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!requireRole(req, res, "admin")) return;

  const { pageId, pageIds, fromCourseId } = req.body || {};
  const requested = normalizePageIds(Array.isArray(pageIds) ? pageIds : [pageId]);
  if (!requested.length || typeof fromCourseId !== "string" || !fromCourseId) {
    return res.status(400).json({ error: "pageIds and fromCourseId are required" });
  }
  if (requested.length > MAX_PAGE_IDS) {
    return res.status(400).json({ error: `At most ${MAX_PAGE_IDS} pages per request` });
  }

  await connectMongo();

  const course: any = await CourseModel.findOne({ id: fromCourseId }).select("pages.id").lean();
  const stillInCourse = ((course?.pages as any[]) || [])
    .map((p) => p?.id)
    .filter((id): id is string => typeof id === "string");
  const { clean, stillPresent } = idsSafeToClean(requested, stillInCourse);
  const pull = progressCleanupPull(clean);
  if (!pull) {
    return res.status(200).json({ ok: true, modified: 0, cleaned: [], skipped: stillPresent });
  }

  const result = await UserProgressModel.updateMany({ courseId: fromCourseId }, { $pull: pull as any });

  return res.status(200).json({
    ok: true,
    modified: (result as any).modifiedCount ?? 0,
    cleaned: clean,
    skipped: stillPresent,
  });
}
