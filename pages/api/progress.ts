import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserProgressModel } from "../../src/lib/models/UserProgress";
import { requireUser, allowMethods } from "../../src/lib/auth";
import { celebrateIfCourseCompleted } from "../../src/lib/training/celebration";

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
    const userId = auth.sub;
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
    const userId = auth.sub;
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

      // Storm Bot celebration: never throws, never blocks the save result.
      await celebrateIfCourseCompleted({
        userId,
        courseId,
        progressBefore,
        progressAfter: progress.toObject(),
      });

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