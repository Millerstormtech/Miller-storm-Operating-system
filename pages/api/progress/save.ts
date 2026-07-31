import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { resolveIncomingQuizResults } from "../../../src/lib/training/quiz-intake";
import { loadGradableQuizPages } from "../../../src/lib/training/quiz-pages";
import { logToDb } from "../../../src/lib/models/SystemLog";
import { celebrateIfCourseCompleted } from "../../../src/lib/training/celebration";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (!allowMethods(req, res, ["POST", "PUT"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  if (req.method === "POST" || req.method === "PUT") {
    const userId = auth.sub;
    const { courseId, pageId, quizResult, courseCompleted } = req.body;

    console.log('💾 Progress Save API called:', { userId, courseId, pageId, courseCompleted });

    if (!courseId) {
      res.status(400).json({ error: 'courseId is required' });
      return;
    }

    try {
      // Find existing progress or create new
      let progress = await UserProgressModel.findOne({ userId, courseId });

      // Pre-save snapshot for the celebration transition check (complete
      // false -> true). toObject() detaches it from the doc mutated below.
      const progressBefore = progress ? progress.toObject() : null;

      if (!progress) {
        // Create new progress record
        progress = new UserProgressModel({
          userId,
          courseId,
          completedPages: [],
          quizResults: [],
          courseCompleted: false
        });
        console.log('📝 Creating new progress record');
      }

      // Update completed pages
      if (pageId && !progress.completedPages.includes(pageId)) {
        progress.completedPages.push(pageId);
        console.log('✅ Added page to completed:', pageId);
      }

      // The server re-grades the incoming quiz result from its own answer key;
      // the caller's claimed score and passed flag are ignored entirely (spec
      // 2026-07-26 §5). This is what protects the current mobile build, which
      // grades locally: it already sends the raw answers, so no app change is
      // needed. Stored results with unchanged answers are preserved exactly,
      // and an earned pass is never downgraded.
      if (quizResult) {
        const quizPages = await loadGradableQuizPages(courseId);
        const storedResults = (progress.quizResults || []).map((r: any) =>
          typeof r?.toObject === "function" ? r.toObject() : r
        );
        const outcome = resolveIncomingQuizResults({
          quizPages,
          stored: storedResults,
          incoming: [quizResult],
        });
        progress.quizResults = outcome.results;
        for (const r of outcome.rejected) {
          await logToDb(
            "warn",
            "QUIZ-INTAKE",
            `Rejected quiz claim: user ${userId}, course ${courseId}, page ${r.pageId}`,
            { claimed: r.claimed, server: r.server }
          );
        }
        console.log('📝 Quiz result re-graded server-side for:', quizResult.pageId);
      }

      // Update course completion
      if (courseCompleted !== undefined) {
        progress.courseCompleted = courseCompleted;
        console.log('🎯 Course completion updated:', courseCompleted);
      }

      // Save to database
      await progress.save();
      console.log('💾 Progress saved successfully');

      // Storm Bot celebration: fire-and-forget so the completing save stays
      // fast (the helper fans out 70+ notifications). It is failure-isolated
      // and never rejects; the catch is belt-and-braces.
      celebrateIfCourseCompleted({
        userId,
        courseId,
        progressBefore,
        progressAfter: progress.toObject(),
      }).catch(() => {});

      res.status(200).json({
        success: true,
        progress: {
          userId: progress.userId,
          courseId: progress.courseId,
          completedPages: progress.completedPages,
          quizResults: progress.quizResults,
          courseCompleted: progress.courseCompleted,
          updatedAt: progress.updatedAt
        }
      });
      return;
      
    } catch (error) {
      console.error('❌ Error saving progress:', error);
      res.status(500).json({ error: 'Failed to save progress' });
      return;
    }
  }

  res.setHeader("Allow", "POST, PUT");
  res.status(405).end();
}