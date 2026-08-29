import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { resolveIncomingQuizResults } from "../../../src/lib/training/quiz-intake";
import { loadGradableQuizPages } from "../../../src/lib/training/quiz-pages";
import { logToDb } from "../../../src/lib/models/SystemLog";
import { celebrateIfCourseCompleted } from "../../../src/lib/training/celebration";
import { stampNewCompletions } from "../../../src/lib/training/completions";
import { ensureProgressRecord } from "../../../src/lib/progressRecord";

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
      // Bounded retry on write contention, for the same reason as /api/progress:
      // this record is written by the website, this endpoint and the
      // watch-position heartbeat, and losing the race used to mean a rep's
      // finished lesson was silently dropped. See the fuller note there.
      let progress: any = null;
      let progressBefore: any = null;
      for (let attempt = 0; ; attempt++) {
        try {
          // Same insert-race guard as /api/progress — and it matters across the two
          // endpoints too, since a rep with the phone app and the website open can
          // have both write this record at the same moment.
          await ensureProgressRecord(userId, courseId);

          // Find existing progress or create new
          progress = await UserProgressModel.findOne({ userId, courseId });

          // Pre-save snapshot for the celebration transition check (complete
          // false -> true). toObject() detaches it from the doc mutated below.
          progressBefore = progress ? progress.toObject() : null;

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
          const justCompleted: string[] = [];
          if (pageId && !progress.completedPages.includes(pageId)) {
            progress.completedPages.push(pageId);
            justCompleted.push(pageId);
            console.log('✅ Added page to completed:', pageId);
          }

          // Record WHEN this page was completed. Only the page added just now is
          // dated: pages already in completedPages were finished at some unknown
          // past time (possibly before dates were recorded at all), and dating
          // those "now" would report a rep's whole back catalogue as completed
          // today. Pages already carrying a date keep it.
          progress.pageCompletions = stampNewCompletions(
            progress.pageCompletions,
            progress.completedPages,
            justCompleted,
            new Date()
          );

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
          break;
        } catch (err: any) {
          const contention = err?.name === "VersionError" || err?.code === 11000;
          if (!contention || attempt >= 3) throw err;
          console.log(`⚠️ Progress write contention (attempt ${attempt + 1}), retrying`);
        }
      }

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