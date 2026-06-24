import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { CourseModel } from "../../../src/lib/models/Course";
import { UserModel } from "../../../src/lib/models/User";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { requireRole, allowMethods } from "../../../src/lib/auth";

// Create an in-app "new course" notification for every sales + manager user
// whenever a course becomes newly available (brand-new published course, or a
// draft that just flipped to published). Sales reps / managers see this as a
// red pop-up on their dashboard. Failures here must never break the save.
async function notifyNewCourses(newlyPublished: any[]) {
  try {
    if (!newlyPublished.length) return;
    const recipients = await UserModel.find(
      {
        deleted: { $ne: true },
        $or: [{ role: { $in: ["sales", "manager"] } }, { roles: { $in: ["sales", "manager"] } }],
      },
      { id: 1, role: 1, roles: 1 }
    ).lean();
    if (!recipients.length) return;

    const docs: any[] = [];
    let i = 0;
    const stamp = Date.now();
    for (const course of newlyPublished) {
      for (const u of recipients as any[]) {
        const isManager = u.role === "manager" || (Array.isArray(u.roles) && u.roles.includes("manager"));
        const watchUrl = isManager ? "/manager/onlineTraining" : "/sales/training";
        docs.push({
          id: `notif-${stamp}-${i++}`,
          userId: u.id,
          type: "course_added",
          title: "🔥 Fresh Course Just Dropped!",
          message: "Ready to boost your sales and marketing game? Check out our newest course now.",
          read: false,
          metadata: { courseId: course.id, courseName: course.title, watchUrl },
        });
      }
    }
    if (docs.length) await NotificationModel.insertMany(docs, { ordered: false });
    console.log(`[Bulk Save] Created ${docs.length} course-added notifications for ${newlyPublished.length} course(s)`);
  } catch (err) {
    console.error("[Bulk Save] Failed to create course notifications:", err);
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

    // Capture the prior state so we can detect courses that become newly
    // available (new published course, or draft -> published) after the save.
    const incomingIds = migratedCourses.map((c) => c.id);
    const priorCourses = await CourseModel.find({ id: { $in: incomingIds } }, { id: 1, status: 1 }).lean();
    const priorIds = new Set(priorCourses.map((c: any) => c.id));
    const priorStatus = new Map(priorCourses.map((c: any) => [c.id, c.status]));

    // Use bulkWrite for better performance
    const bulkOps = migratedCourses.map((course) => ({
      updateOne: {
        filter: { id: course.id },
        update: { $set: course },
        upsert: true
      }
    }));

    await CourseModel.bulkWrite(bulkOps);

    // Notify sales + managers about courses that just became available.
    const newlyPublished = migratedCourses.filter((c) => {
      if (c.status !== "published") return false;
      if (!priorIds.has(c.id)) return true; // brand-new published course
      return priorStatus.get(c.id) === "draft"; // draft -> published
    });
    await notifyNewCourses(newlyPublished);

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
