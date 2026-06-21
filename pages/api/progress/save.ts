import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";

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

  await connectMongo();

  if (req.method === "POST" || req.method === "PUT") {
    const { userId, courseId, pageId, quizResult, courseCompleted } = req.body;
    
    console.log('💾 Progress Save API called:', { userId, courseId, pageId, courseCompleted });
    
    if (!userId || !courseId) {
      res.status(400).json({ error: 'userId and courseId are required' });
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

      // Update quiz results
      if (quizResult) {
        const existingQuizIndex = progress.quizResults.findIndex(
          (q: any) => q.pageId === quizResult.pageId
        );
        
        if (existingQuizIndex >= 0) {
          progress.quizResults[existingQuizIndex] = quizResult;
          console.log('📝 Updated quiz result for:', quizResult.pageId);
        } else {
          progress.quizResults.push(quizResult);
          console.log('✅ Added new quiz result for:', quizResult.pageId);
        }
      }

      // Update course completion
      if (courseCompleted !== undefined) {
        progress.courseCompleted = courseCompleted;
        console.log('🎯 Course completion updated:', courseCompleted);
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

  res.setHeader("Allow", "POST, PUT");
  res.status(405).end();
}