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
    const { userId, courseId } = req.query;
    
    console.log('📊 Progress API GET called for userId:', userId, 'courseId:', courseId);
    
    if (!userId || !courseId) {
      res.status(400).json({ error: 'userId and courseId are required' });
      return;
    }

    try {
      // Get user progress from database
      const progress = await UserProgressModel.findOne({ userId, courseId });
      
      if (!progress) {
        console.log('📊 No progress found, returning empty');
        res.status(200).json({
          completedPages: [],
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
    const { userId, courseId, completedPages, quizResults, courseCompleted } = req.body;
    
    console.log('💾 Progress API POST called:', { userId, courseId, completedPages: completedPages?.length, courseCompleted });
    
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