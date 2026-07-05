import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { CourseModel } from "../../../src/lib/models/Course";
import { UserModel } from "../../../src/lib/models/User";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { requireUser, requireRole, allowMethods } from "../../../src/lib/auth";
import { isQuizResultPassing } from "../../../src/lib/quiz";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (!allowMethods(req, res, ["GET", "POST", "DELETE"])) return;

  await connectMongo();

  if (req.method === "GET") {
    const auth = requireUser(req, res);
    if (!auth) return;
    const userId = auth.sub;
    const userRole = auth.role;
    // Lightweight list mode (mobile course list): strip heavy per-page content
    // (HTML body, transcript, quiz questions) since the list only needs course
    // title/cover/progress — the detail screen re-fetches the full course.
    // Web does NOT pass this flag, so its payload is unchanged.
    const listMode = !!req.query.list;
    // Summary mode (admin course list first paint): drop the heavy per-page
    // content at the DB level so the grid loads fast. The admin page then
    // re-fetches the full payload in the background for instant course open.
    const summaryMode = !!req.query.summary;

    console.log('📚 Courses API called with userId:', userId, 'userRole:', userRole);

    // Fetch all necessary course and page fields
    const courseQuery = CourseModel.find({});
    if (summaryMode) {
      courseQuery.select('-pages -quizQuestions -links');
    } else if (listMode) {
      // List mode only needs light page metadata (id/title/status/isQuiz/…), so
      // exclude the heavy per-page content at the DB level. This keeps the query
      // and payload small — previously the full HTML body/transcript/quiz for
      // EVERY page of EVERY course was loaded just to be stripped in JS, which
      // made the mobile course list slow and prone to timeouts.
      courseQuery.select('-pages.body -pages.transcript -pages.quizQuestions -pages.resourceLinks -pages.fileUrls -pages.pinnedCommunityPostUrl -quizQuestions -links');
    }
    const courses = await courseQuery.lean();
    console.log('📚 Total courses in DB:', courses.length);

    // Admins manage every course (including drafts), so never filter for them.
    // Sales/Managers go through the published + access-mode filter below.
    if (!userId || !userRole || userRole === 'admin') {
      console.log('📚 Admin/no-context request — returning all courses (incl. drafts)');
      res.status(200).json(courses);
      return;
    }

    // Get user to check training center feature toggle
    const user = await UserModel.findOne({ id: userId }).lean();
    if (!user) {
      console.log('📚 User not found, returning empty array');
      res.status(200).json([]);
      return;
    }
    
    console.log('📚 User found:', user.name, 'trainingCenter toggle:', user.featureToggles?.trainingCenter);
    
    // Filter courses based on access mode and user's training center toggle
    const filteredCourses = courses.filter((course: any) => {
      // Only show published courses (not draft)
      if (course.status !== "published") {
        return false;
      }
      
      // Check if user has training center enabled
      if (!user.featureToggles?.trainingCenter) {
        return false;
      }
      
      // If course is open to all members, show it
      if (course.accessMode === "open" || !course.accessMode) {
        return true;
      }
      
      // If course is assigned only, show only to managers
      if (course.accessMode === "assigned" && userRole === "manager") {
        return true;
      }
      
      return false;
    });
    
    console.log('📚 Filtered courses count:', filteredCourses.length);
    
    // Get progress data directly from UserProgressModel
    const courseIds = filteredCourses.map(c => c.id);
    const progressRecords = await UserProgressModel.find({
      userId: userId,
      courseId: { $in: courseIds }
    }).lean();
    
    // Create a map of courseId -> progress
    const progressMap = new Map();
    progressRecords.forEach(record => {
      progressMap.set(record.courseId, {
        completedPages: record.completedPages || [],
        quizResults: record.quizResults || [],
        courseCompleted: record.courseCompleted || false
      });
    });
    
    const coursesWithProgress = filteredCourses.map((course: any) => {
      const progress = progressMap.get(course.id);
      
      // Filter out draft lessons/pages - only show published ones
      const publishedPages = course.pages?.filter((p: any) => p.status === 'published') || [];
      const publishedFolders = course.folders?.filter((f: any) => f.status === 'published') || [];
      
      // Progress counts BOTH lessons (completed) and quizzes (passed) out of all
      // published pages — matches the web so a new quiz drops % below 100%.
      const completedSet = new Set(progress?.completedPages || []);
      const quizResults = progress?.quizResults || [];
      const totalPages = publishedPages.length;
      const completedPages = publishedPages.filter((p: any) =>
        p.isQuiz
          ? isQuizResultPassing(quizResults.find((r: any) => r.pageId === p.id))
          : completedSet.has(p.id)
      ).length;
      const progressPercent = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;

      // In list mode keep only light page metadata (drop heavy content fields
      // that bloat the payload and slow the mobile list).
      const pagesOut = listMode
        ? publishedPages.map((p: any) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            folderId: p.folderId,
            isQuiz: p.isQuiz,
            videoUrl: p.videoUrl,
            questionsToShow: p.questionsToShow,
          }))
        : publishedPages;

      return {
        ...course,
        pages: pagesOut,
        folders: publishedFolders,
        progress: {
          completedLessons: completedPages,
          totalLessons: totalPages,
          progressPercent: progressPercent
        }
      };
    });
    
    // Sort courses by order field
    coursesWithProgress.sort((a: any, b: any) => {
      const orderA = a.order ?? 999999;
      const orderB = b.order ?? 999999;
      return orderA - orderB;
    });
    
    console.log('✅ Returning courses with progress data');
    res.status(200).json(coursesWithProgress);
    return;
  }

  if (req.method === "POST") {
    if (!requireRole(req, res, "admin")) return;
    const payload = req.body;
    const id = payload.id || `course-${Date.now()}`;
    const created = await CourseModel.create({ ...payload, id });
    res.status(201).json(created);
    return;
  }

  if (req.method === "DELETE") {
    if (!requireRole(req, res, "admin")) return;
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: "Course ID is required" });
    }
    // Delete course and all associated progress
    await Promise.all([
      CourseModel.deleteOne({ id: id }),
      UserProgressModel.deleteMany({ courseId: id })
    ]);
    return res.status(200).json({ success: true });
  }
}
