import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserProgressModel } from "../../src/lib/models/UserProgress";
import { requireUser, allowMethods } from "../../src/lib/auth";
import { resolveIncomingQuizResults } from "../../src/lib/training/quiz-intake";
import { loadGradableQuizPages } from "../../src/lib/training/quiz-pages";
import { logToDb } from "../../src/lib/models/SystemLog";
import { celebrateIfCourseCompleted } from "../../src/lib/training/celebration";
import { stampNewCompletions } from "../../src/lib/training/completions";

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

  if (!allowMethods(req, res, ["GET", "POST"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  if (req.method === "GET") {
    // Whose progress? Self by default. A leader (the same role list the
    // course-progress bulk mode trusts) may read a specific other user, which
    // is what the manager Team Training Progress screen does. Anyone else
    // asking about another user gets an explicit 403, never someone else's
    // data and never silently their own (that silent fallback is the bug this
    // fixes: leaders were shown THEIR OWN progress labeled as each member's).
    const LEADER_ROLES = ['admin', 'c-level', 'branch-manager', 'sales-team-lead'];
    const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : '';
    let userId = auth.sub;
    if (requestedUserId && requestedUserId !== auth.sub) {
      if (!LEADER_ROLES.includes((auth.role || '').toString())) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      userId = requestedUserId;
    }
    const { courseId } = req.query;

    console.log('📊 Progress API GET called for userId:', userId, 'courseId:', courseId);

    if (!courseId) {
      res.status(400).json({ error: 'courseId is required' });
      return;
    }

    try {
      // Read-only GET — .lean() skips document hydration (the response below is
      // built by hand, so no toJSON behaviour is lost). The POST path keeps a
      // real document because it calls .save().
      const progress = await UserProgressModel.findOne({ userId, courseId }).lean() as any;
      
      if (!progress) {
        console.log('📊 No progress found, returning empty');
        res.status(200).json({
          completedPages: [],
          unlockedPages: [],
          quizResults: [],
          courseCompleted: false
        });
        return;
      }

      console.log('📊 Progress found:', {
        completedPages: progress.completedPages?.length || 0,
        quizResults: progress.quizResults?.length || 0,
        courseCompleted: progress.courseCompleted
      });
      
      res.status(200).json({
        completedPages: progress.completedPages || [],
        unlockedPages: progress.unlockedPages || [],
        quizResults: progress.quizResults || [],
        courseCompleted: progress.courseCompleted || false
      });
      return;
    } catch (error) {
      console.error('❌ Error fetching progress:', error);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  }

  if (req.method === "POST") {
    // Writes are self-only, with ONE exception: an admin may write on behalf
    // of another user (the leaderboard's Override tool). Before this fix the
    // body's userId was ignored entirely, so an admin override silently wrote
    // to the ADMIN'S OWN record and the target rep was never touched.
    const requestedUserId = typeof req.body.userId === 'string' ? req.body.userId : '';
    let userId = auth.sub;
    if (requestedUserId && requestedUserId !== auth.sub) {
      if ((auth.role || '').toString() !== 'admin') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      userId = requestedUserId;
    }
    const { courseId, completedPages, quizResults, courseCompleted } = req.body;

    console.log('💾 Progress API POST called:', { userId, courseId, completedPages: completedPages?.length, courseCompleted });

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

      // The server re-grades every incoming quiz result from its own answer
      // key; the caller's claimed score and passed flag are ignored entirely
      // (spec 2026-07-26 §5). Stored results with unchanged answers are
      // preserved exactly, and an earned pass is never downgraded.
      let quizResultsToStore = quizResults;
      if (quizResults !== undefined) {
        const quizPages = await loadGradableQuizPages(courseId);
        const storedResults = (progress?.quizResults || []).map((r: any) =>
          typeof r?.toObject === "function" ? r.toObject() : r
        );
        const outcome = resolveIncomingQuizResults({
          quizPages,
          stored: storedResults,
          incoming: Array.isArray(quizResults) ? quizResults : [],
        });
        quizResultsToStore = outcome.results;
        for (const r of outcome.rejected) {
          await logToDb(
            "warn",
            "QUIZ-INTAKE",
            `Rejected quiz claim: user ${userId}, course ${courseId}, page ${r.pageId}`,
            { claimed: r.claimed, server: r.server }
          );
        }
      }

      // Which pages this request is the FIRST to report complete. Only these
      // may be dated: see the note at the stampNewCompletions() call below.
      let justCompleted: string[] = [];

      if (!progress) {
        // Create new progress record
        const initialPages = Array.isArray(completedPages) ? completedPages : [];
        progress = new UserProgressModel({
          userId,
          courseId,
          completedPages: completedPages || [],
          quizResults: quizResultsToStore || [],
          courseCompleted: courseCompleted || false
        });
        justCompleted = initialPages;
        console.log('📝 Creating new progress record');
      } else {
        // Update existing progress
        if (completedPages !== undefined) {
          const incoming = Array.isArray(completedPages) ? completedPages : [];
          const alreadyStored = new Set<string>(progress.completedPages || []);
          // The admin Override tool is deliberately excluded: an admin ticking
          // a box is a correction to the record, not evidence of when the rep
          // actually watched the lesson, so it adds pages WITHOUT dating them.
          // Only a learner's own save counts as a live completion.
          justCompleted = req.body.replace === true
            ? []
            : incoming.filter((id: string) => !alreadyStored.has(id));
          // The admin Override tool sends replace:true to set an EXACT set (it
          // can uncheck pages to reset a rep). Every OTHER caller is a learner
          // recording a watched page, where completedPages must only ever GROW.
          // So we union with what's already stored. That makes the write immune
          // to a stale, partial, racy, or cross-device array silently erasing
          // already-watched pages — the root of the "I keep having to rewatch
          // videos I already watched, and it won't clear" bug (a full-array
          // replace from client state could wipe progress on any bad write).
          if (req.body.replace === true) {
            progress.completedPages = incoming;
          } else {
            progress.completedPages = Array.from(
              new Set([...(progress.completedPages || []), ...incoming])
            );
          }
        }
        if (quizResults !== undefined) {
          progress.quizResults = quizResultsToStore;
        }
        if (courseCompleted !== undefined) {
          progress.courseCompleted = courseCompleted;
        }
        console.log('📝 Updating existing progress record');
      }

      // Record WHEN each page was completed, alongside the completedPages list
      // that says WHETHER it was. Only pages this request is the first to
      // report get a date; anything already in completedPages was finished at
      // an unknown past time (very possibly before dates were recorded at all)
      // and dating it now would report a rep's entire back catalogue as
      // completed today. Pages already carrying a date keep it, and pages that
      // are no longer completed lose theirs, so the two lists cannot drift.
      progress.pageCompletions = stampNewCompletions(
        progress.pageCompletions,
        progress.completedPages,
        justCompleted,
        new Date()
      );

      // Save to database
      await progress.save();
      console.log('💾 Progress saved successfully');

      // Storm Bot celebration: fire-and-forget so the completing save stays
      // fast (the helper fans out 70+ notifications). It is failure-isolated
      // and never rejects; the catch is belt-and-braces.
      //
      // SELF-EARNED ONLY. This endpoint lets an admin write on behalf of another
      // user (the leaderboard Override tool), and an override must never post a
      // public "just passed the course" announcement on that rep's behalf: the
      // whole point of the celebration is that the finish was earned.
      if (userId === auth.sub) {
        celebrateIfCourseCompleted({
          userId,
          courseId,
          progressBefore,
          progressAfter: progress.toObject(),
        }).catch(() => {});
      }

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

  res.setHeader("Allow", "GET, POST");
  res.status(405).end();
}