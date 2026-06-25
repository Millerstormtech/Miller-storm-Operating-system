import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { CourseModel } from "../../../src/lib/models/Course";
import { UserModel } from "../../../src/lib/models/User";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { sendPushNotificationToMultiple } from "../../../src/lib/firebase-admin";
import { requireRole, allowMethods } from "../../../src/lib/auth";

type ContentAnnouncement = {
  course: any;
  newPages: { title: string; isQuiz: boolean }[];
};

// Create an in-app "new training" notification for every sales + manager user
// whenever a new LESSON or QUIZ becomes available inside a PUBLISHED course
// (a brand-new published page, or a page that just flipped draft -> published).
// Sales reps / managers see this as a red pop-up on their dashboard.
// Failures here must never break the save.
async function notifyNewContent(announcements: ContentAnnouncement[]) {
  try {
    if (!announcements.length) return;
    const recipients = await UserModel.find(
      {
        deleted: { $ne: true },
        $or: [{ role: { $in: ["sales", "manager"] } }, { roles: { $in: ["sales", "manager"] } }],
      },
      { id: 1, role: 1, roles: 1, fcmToken: 1 }
    ).lean();
    if (!recipients.length) return;

    // FCM device tokens of all sales + managers (for mobile push).
    const pushTokens = (recipients as any[]).map((u) => u.fcmToken).filter(Boolean);

    const docs: any[] = [];
    let i = 0;
    const stamp = Date.now();
    for (const { course, newPages } of announcements) {
      const lessons = newPages.filter((p) => !p.isQuiz);
      const quizzes = newPages.filter((p) => p.isQuiz);

      let message: string;
      if (newPages.length === 1) {
        const p = newPages[0];
        message = `New ${p.isQuiz ? "quiz" : "lesson"} "${p.title}" was just added in "${course.title}". Check it out now.`;
      } else {
        const parts: string[] = [];
        if (lessons.length) parts.push(`${lessons.length} new lesson${lessons.length > 1 ? "s" : ""}`);
        if (quizzes.length) parts.push(`${quizzes.length} new quiz${quizzes.length > 1 ? "zes" : ""}`);
        message = `${parts.join(" and ")} just added in "${course.title}". Check it out now.`;
      }

      // Mobile push (FCM) to all sales + managers — fire-and-forget.
      if (pushTokens.length) {
        try {
          await sendPushNotificationToMultiple(
            pushTokens,
            "🔥 New Training Added",
            message,
            { courseId: course.id, courseName: course.title, type: "new_training" }
          );
        } catch (pushErr) {
          console.error("[Bulk Save] Push notification failed:", pushErr);
        }
      }

      // Dedup per course: if a user already has an UNREAD "new training"
      // notification for this course, refresh it instead of stacking another —
      // so a rep never gets more than one unread pop-up per course, no matter
      // how many times the admin saves.
      const existing = await NotificationModel.find(
        { type: "course_added", read: false, "metadata.courseId": course.id },
        { userId: 1 }
      ).lean();
      const haveUnread = new Set((existing as any[]).map((e) => e.userId));

      if (haveUnread.size) {
        await NotificationModel.updateMany(
          { type: "course_added", read: false, "metadata.courseId": course.id },
          { $set: { title: "🔥 New Training Just Added!", message } }
        );
      }

      for (const u of recipients as any[]) {
        if (haveUnread.has(u.id)) continue; // already has an unread pop-up for this course
        const isManager = u.role === "manager" || (Array.isArray(u.roles) && u.roles.includes("manager"));
        const watchUrl = isManager ? "/manager/onlineTraining" : "/sales/training";
        docs.push({
          id: `notif-${stamp}-${i++}`,
          userId: u.id,
          type: "course_added",
          title: "🔥 New Training Just Added!",
          message,
          read: false,
          metadata: { courseId: course.id, courseName: course.title, watchUrl },
        });
      }
    }
    if (docs.length) await NotificationModel.insertMany(docs, { ordered: false });
    console.log(`[Bulk Save] Created ${docs.length} new-training notifications for ${announcements.length} course(s)`);
  } catch (err) {
    console.error("[Bulk Save] Failed to create training notifications:", err);
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const startTime = Date.now();
  
  try {
    if (!allowMethods(req, res, ["PUT"])) return;
    if (!requireRole(req, res, "admin")) return;

    await connectMongo();

    const courses = Array.isArray(req.body) ? req.body : req.body?.courses;
    if (!Array.isArray(courses)) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    console.log(`[Bulk Save] Saving ${courses.length} courses`);

    // Migrate fileUrls from string[] to LessonLink[] format
    const migratedCourses = courses.map(course => {
      if (course.pages && Array.isArray(course.pages)) {
        course.pages = course.pages.map((page: any) => {
          if (page.fileUrls && Array.isArray(page.fileUrls)) {
            page.fileUrls = page.fileUrls.map((fileUrl: any) => {
              if (typeof fileUrl === 'object' && fileUrl.label && fileUrl.href) {
                return fileUrl;
              }
              if (typeof fileUrl === 'string') {
                const fileName = fileUrl.split('/').pop() || 'File';
                return { label: fileName, href: fileUrl };
              }
              return { label: 'File', href: String(fileUrl) };
            });
          }
          return page;
        });
      }
      return course;
    });

    // Capture the prior pages of each course so we can detect newly-added
    // lessons/quizzes (new published page, or a page flipped draft -> published).
    const incomingIds = migratedCourses.map((c) => c.id);
    const priorCourses = await CourseModel.find({ id: { $in: incomingIds } }, { id: 1, pages: 1 }).lean();
    const priorById = new Map(priorCourses.map((c: any) => [c.id, c]));

    // Use bulkWrite for better performance
    const bulkOps = migratedCourses.map((course) => ({
      updateOne: {
        filter: { id: course.id },
        update: { $set: course },
        upsert: true
      }
    }));

    await CourseModel.bulkWrite(bulkOps);

    // Notify sales + managers about NEW lessons/quizzes that just became
    // visible inside a PUBLISHED course (new published page, or draft->published).
    const announcements: ContentAnnouncement[] = [];
    for (const course of migratedCourses) {
      if (course.status !== "published") continue; // a draft course isn't visible to reps
      const prior = priorById.get(course.id);
      const priorPages: any[] = Array.isArray(prior?.pages) ? prior.pages : [];
      const priorPageIds = new Set(priorPages.map((p) => p.id));
      const priorPageStatus = new Map(priorPages.map((p) => [p.id, p.status]));

      const newPages = (Array.isArray(course.pages) ? course.pages : [])
        .filter((p: any) => {
          if (p.status !== "published") return false;
          if (!priorPageIds.has(p.id)) return true; // brand-new published lesson/quiz
          return priorPageStatus.get(p.id) === "draft"; // draft -> published
        })
        .map((p: any) => ({ title: p.title || (p.isQuiz ? "Quiz" : "Lesson"), isQuiz: Boolean(p.isQuiz) }));

      if (newPages.length) announcements.push({ course, newPages });
    }
    await notifyNewContent(announcements);

    // Return only the saved courses
    const savedCourses = await CourseModel.find({ 
      id: { $in: migratedCourses.map(c => c.id) } 
    }).lean();

    const duration = Date.now() - startTime;
    console.log(`[Bulk Save] Successfully saved ${savedCourses.length} courses in ${duration}ms`);
    
    res.status(200).json(savedCourses);
  } catch (error) {
    console.error('[Bulk Save] Error:', error);
    res.status(500).json({ error: 'Failed to save courses' });
  }
}
