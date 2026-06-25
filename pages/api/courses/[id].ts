import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { CourseModel } from "../../../src/lib/models/Course";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { requireUser, allowMethods } from "../../../src/lib/auth";
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

  if (!allowMethods(req, res, ["GET"])) return;

  await connectMongo();

  if (req.method === "GET") {
    const auth = requireUser(req, res);
    if (!auth) return;
    const { id } = req.query;
    const userId = auth.sub;

    console.log('📚 Course detail API called for:', id, 'userId:', userId);
    
    try {
      // Fetch course by ID with all fields
      const course = await CourseModel.findOne({ id: id }).lean();
      
      if (!course) {
        console.log('❌ Course not found:', id);
        res.status(404).json({ error: 'Course not found' });
        return;
      }

      console.log('✅ Course found:', course.title);
      console.log('📁 Folders:', course.folders?.length || 0);
      console.log('📄 Pages:', course.pages?.length || 0);

      // Calculate progress if userId provided
      let progress = {
        completedLessons: 0,
        totalLessons: 0,
        progressPercent: 0
      };

      // Progress counts BOTH lessons (completed) and quizzes (passed) out of all
      // published pages — matches the web so a new quiz drops % below 100%.
      const publishedPages = course.pages?.filter((p: any) => p.status === 'published') || [];
      const totalItems = publishedPages.length;
      progress.totalLessons = totalItems;

      if (userId) {
        try {
          // Get progress directly from UserProgressModel
          const userProgress = await UserProgressModel.findOne({
            userId: userId,
            courseId: id
          }).lean();

          if (userProgress) {
            const completedSet = new Set(userProgress.completedPages || []);
            const quizResults = userProgress.quizResults || [];
            const completedCount = publishedPages.filter((p: any) =>
              p.isQuiz
                ? isQuizResultPassing(quizResults.find((r: any) => r.pageId === p.id))
                : completedSet.has(p.id)
            ).length;
            const progressPercent = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

            progress.completedLessons = completedCount;
            progress.progressPercent = progressPercent;

            console.log(`✅ Progress result: ${completedCount}/${totalItems} items = ${progressPercent}%`);
          }
        } catch (error) {
          console.log('⚠️ Could not get progress:', error);
        }
      }

      const response = {
        ...course,
        progress
      };

      console.log('📊 Progress:', progress);
      res.status(200).json(response);
      return;
    } catch (error) {
      console.error('❌ Error fetching course:', error);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  }
}