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
      // list=1 → the course DETAIL list only needs light page metadata (the
      // lesson player re-fetches full content per lesson), so strip the heavy
      // per-page content at the DB level for a fast, small response.
      const listMode = !!req.query.list;
      const courseQuery = CourseModel.findOne({ id: id });
      if (listMode) {
        courseQuery.select('-pages.body -pages.transcript -pages.quizQuestions -pages.resourceLinks -pages.fileUrls -pages.pinnedCommunityPostUrl -quizQuestions -links');
      }
      const course = await courseQuery.lean();

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

      // Return these arrays too so the mobile course-detail screen gets progress
      // in this SAME response (no separate /api/progress round-trip needed).
      let completedPages: string[] = [];
      let unlockedPages: string[] = [];
      let quizResultsOut: any[] = [];

      if (userId) {
        try {
          // Get progress directly from UserProgressModel
          const userProgress = await UserProgressModel.findOne({
            userId: userId,
            courseId: id
          }).lean();

          if (userProgress) {
            completedPages = (userProgress.completedPages || []) as string[];
            unlockedPages = (userProgress.unlockedPages || []) as string[];
            quizResultsOut = userProgress.quizResults || [];
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

      // Lazy per-lesson mode: the lesson player passes ?pageId=<open lesson>. It
      // needs the FULL heavy content (body/transcript/quiz) of ONLY that one
      // lesson, plus light metadata for the rest to build Next/Prev + counts.
      // Trimming the other pages here cuts the per-lesson response from "every
      // lesson's full content" down to one — so lessons/quiz load fast on tap.
      const pageId = req.query.pageId ? String(req.query.pageId) : null;
      let pagesOut: any = course.pages;
      if (pageId) {
        pagesOut = (course.pages || []).map((p: any) =>
          p.id === pageId
            ? p
            : {
                id: p.id,
                title: p.title,
                status: p.status,
                folderId: p.folderId,
                isQuiz: p.isQuiz,
                videoUrl: p.videoUrl,
                order: p.order,
                questionsToShow: p.questionsToShow,
              }
        );
      }

      const response = {
        ...course,
        pages: pagesOut,
        progress,
        completedPages,
        unlockedPages,
        quizResults: quizResultsOut
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