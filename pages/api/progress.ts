import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserProgressModel } from "../../src/lib/models/UserProgress";
import { requireUser, allowMethods } from "../../src/lib/auth";

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
      
      if (!progress) {
        // Create new progress record
        progress = new UserProgressModel({
          userId,
          courseId,
          completedPages: completedPages || [],
          quizResults: quizResults || [],
          courseCompleted: courseCompleted || false
        });
        console.log('📝 Creating new progress record');
      } else {
        // Update existing progress
        if (completedPages !== undefined) {
          progress.completedPages = completedPages;
        }
        if (quizResults !== undefined) {
          progress.quizResults = quizResults;
        }
        if (courseCompleted !== undefined) {
          progress.courseCompleted = courseCompleted;
        }
        console.log('📝 Updating existing progress record');
      }

      // Save to database
      await progress.save();
      console.log('💾 Progress saved successfully');

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