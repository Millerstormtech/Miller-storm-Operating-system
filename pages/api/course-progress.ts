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

  if (!allowMethods(req, res, ["GET"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  if (req.method === "GET") {
    const { courseIds, userIds } = req.query;

    if (!courseIds) {
      res.status(400).json({ error: 'courseIds are required' });
      return;
    }

    const courseIdArray = (courseIds as string).split(',');

    // Bulk mode: an authorized leader reads MANY team members' progress in ONE
    // query. { userId: { courseId: progress } }. This replaces the old
    // per-user fetch loop (N round-trips) that made the company-wide Team
    // Progress view slow — and which also returned the wrong user's data,
    // because the single-user path below is locked to the caller's own id.
    if (userIds) {
      const leaderRoles = ['admin', 'c-level', 'branch-manager', 'sales-team-lead'];
      if (!leaderRoles.includes((auth.role || '').toString())) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      try {
        const userIdArray = (userIds as string).split(',').filter(Boolean);
        const records = await UserProgressModel.find({
          userId: { $in: userIdArray },
          courseId: { $in: courseIdArray },
        }).select('userId courseId completedPages quizResults courseCompleted').lean();
        const out: Record<string, Record<string, any>> = {};
        for (const uid of userIdArray) out[uid] = {};
        records.forEach((r: any) => {
          (out[r.userId] ||= {})[r.courseId] = {
            completedPages: r.completedPages || [],
            quizResults: r.quizResults || [],
            courseCompleted: r.courseCompleted || false,
          };
        });
        res.status(200).json(out);
        return;
      } catch (error) {
        console.error('❌ Error fetching bulk course progress:', error);
        res.status(500).json({ error: 'Internal server error' });
        return;
      }
    }

    // Single-user (default): a user only ever reads their OWN progress.
    const userId = auth.sub;
    console.log('📊 Course Progress API called for userId:', userId, 'courseIds:', courseIds);

    try {
      const result: Record<string, any> = {};
      
      // Read-only: select just the fields the response maps below, and .lean()
      // to skip Mongoose document hydration.
      const progressRecords = await UserProgressModel.find({
        userId,
        courseId: { $in: courseIdArray }
      }).select('courseId completedPages quizResults courseCompleted').lean();
      
      // Create a map of courseId -> progress
      const progressMap = new Map();
      progressRecords.forEach(record => {
        progressMap.set(record.courseId, {
          completedPages: record.completedPages || [],
          quizResults: record.quizResults || [],
          courseCompleted: record.courseCompleted || false
        });
      });
      
      // Build result object with all requested courses
      courseIdArray.forEach(courseId => {
        const courseProgress = progressMap.get(courseId) || {
          completedPages: [],
          quizResults: [],
          courseCompleted: false
        };
        result[courseId] = courseProgress;
      });

      console.log('📊 Database progress found for', Object.keys(result).length, 'courses');
      res.status(200).json(result);
      return;
    } catch (error) {
      console.error('❌ Error fetching course progress:', error);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  }

  res.setHeader("Allow", "GET");
  res.status(405).end();
}