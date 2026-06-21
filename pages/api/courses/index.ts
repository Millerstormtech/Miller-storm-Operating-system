import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { CourseModel } from "../../../src/lib/models/Course";
import { UserModel } from "../../../src/lib/models/User";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";

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

  await connectMongo();

  if (req.method === "GET") {
    const { userId, userRole } = req.query;
    
    console.log('📚 Courses API called with userId:', userId, 'userRole:', userRole);
    
    // Fetch all necessary course and page fields
    const courses = await CourseModel.find({}).lean();
    console.log('📚 Total courses in DB:', courses.length);
    
    // If no user context, return all courses (for admin)
    if (!userId || !userRole) {
      console.log('📚 No user context, returning all courses');
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
      
      // Use web's exact calculation - only count lesson pages (not quizzes)
      const lessonPages = publishedPages.filter((p: any) => !p.isQuiz);
      const totalPages = lessonPages.length;
      const completedPages = progress?.completedPages?.length || 0;
      const progressPercent = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;
      
      return {
        ...course,
        pages: publishedPages,
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
    const payload = req.body;
    const id = payload.id || `course-${Date.now()}`;
    const created = await CourseModel.create({ ...payload, id });
    res.status(201).json(created);
    return;
  }

  if (req.method === "DELETE") {
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

  res.setHeader("Allow", "GET, POST, DELETE");
  res.status(405).end();
}
