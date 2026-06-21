import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserProgressModel } from "../../src/lib/models/UserProgress";
import { CourseModel } from "../../src/lib/models/Course";

// Direct web progress API - returns exact percentages that web shows
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method === "GET") {
    const { userId, courseIds } = req.query;
    
    console.log('🌐 Web Progress API - Direct fetch for:', userId);
    
    if (!userId || !courseIds) {
      res.status(400).json({ error: 'userId and courseIds required' });
      return;
    }

    try {
      await connectMongo();
      
      const courseIdArray = (courseIds as string).split(',');
      
      // Get progress from database
      const progressRecords = await UserProgressModel.find({ 
        userId, 
        courseId: { $in: courseIdArray } 
      });
      
      // Get course details to calculate percentages
      const courses = await CourseModel.find({ id: { $in: courseIdArray } });
      
      const result: Record<string, number> = {};
      
      courseIdArray.forEach(courseId => {
        const progressRecord = progressRecords.find(p => p.courseId === courseId);
        const course = courses.find(c => c.id === courseId);
        
        const completedPages = progressRecord?.completedPages?.length || 0;
        const totalPages = course?.pages?.filter((p: any) => p.status === 'published' && !p.isQuiz)?.length || 0;
        const percentage = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;
        
        result[courseId] = percentage;
        console.log(`🌐 ${course?.title || courseId}: ${percentage}% (${completedPages}/${totalPages})`);
      });
      
      res.status(200).json(result);
      return;
      
    } catch (error) {
      console.error('❌ Web progress fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch web progress' });
      return;
    }
  }

  res.setHeader("Allow", "GET");
  res.status(405).end();
}