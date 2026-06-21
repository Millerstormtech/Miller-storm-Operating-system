import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserProgressModel } from "../../src/lib/models/UserProgress";

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
    const { userId, courseIds } = req.query;
    
    console.log('📊 Course Progress API called for userId:', userId, 'courseIds:', courseIds);
    
    if (!userId || !courseIds) {
      res.status(400).json({ error: 'userId and courseIds are required' });
      return;
    }

    try {
      const courseIdArray = (courseIds as string).split(',');
      const result: Record<string, any> = {};
      
      // Fetch progress for all courses from database
      const progressRecords = await UserProgressModel.find({ 
        userId, 
        courseId: { $in: courseIdArray } 
      });
      
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