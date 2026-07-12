import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import PlaylistAssignment from '../../../src/lib/models/PlaylistAssignment';
import Playlist from '../../../src/lib/models/Playlist';
import { UserProgressModel } from '../../../src/lib/models/UserProgress';
import { requireUser, requireRole, allowMethods } from '../../../src/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET', 'POST', 'DELETE'])) return;

  await connectMongo();

  if (req.method === 'GET') {
    if (!requireUser(req, res)) return;
    try {
      const { userId, managerId, playlistId } = req.query;
      
      let query: any = {};
      if (userId) {
        query.assignedToUserId = userId;
      }
      if (managerId) {
        query.managerId = managerId;
      }
      if (playlistId) {
        query.playlistId = playlistId;
      }
      
      const assignments = await PlaylistAssignment.find(query).sort({ createdAt: -1 });
      return res.status(200).json(assignments);
    } catch (error) {
      console.error('Error fetching playlist assignments:', error);
      return res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  }

  if (req.method === 'POST') {
    if (!requireRole(req, res, ['admin', 'manager', 'c-level'])) return;
    try {
      const {
        playlistId,
        playlistName, 
        courseId, 
        courseName, 
        selectedModules, 
        managerId,
        managerName,
        assignedToUserId,
        assignedToUserName,
        deadline
      } = req.body;

      if (!playlistId || !managerId || !assignedToUserId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const assignment = await PlaylistAssignment.create({
        playlistId,
        playlistName,
        courseId,
        courseName,
        selectedModules,
        managerId,
        managerName,
        assignedToUserId,
        assignedToUserName,
        deadline: deadline ? new Date(deadline) : undefined
      });

      // Auto-unlock the playlist's lessons/quizzes for the assigned rep so they
      // can watch any of them in any order (no sequential lock). This adds to
      // UserProgress.unlockedPages, which is kept SEPARATE from completedPages —
      // so unlocking never counts toward progress %. Progress still advances only
      // when the rep actually watches a lesson / passes a quiz. Resolve the
      // course + pages from the Playlist record so it's correct regardless of the
      // request body.
      try {
        // Prefer the Playlist record, but fall back to the request body (which
        // always carries courseId + selectedModules) if the lookup can't run
        // (e.g. a non-ObjectId playlistId).
        let pl: any = null;
        try { pl = await Playlist.findById(playlistId).lean(); } catch { pl = null; }
        const unlockCourseId = pl?.courseId || courseId;
        const pages: string[] = (pl?.selectedModules && pl.selectedModules.length
          ? pl.selectedModules
          : selectedModules) || [];
        if (unlockCourseId && Array.isArray(pages) && pages.length > 0) {
          await UserProgressModel.updateOne(
            { userId: assignedToUserId, courseId: unlockCourseId },
            { $addToSet: { unlockedPages: { $each: pages } } },
            { upsert: true }
          );
        }
      } catch (unlockErr) {
        // Don't fail the assignment if the auto-unlock hiccups.
        console.error('Auto-unlock on playlist assign failed:', unlockErr);
      }

      return res.status(201).json(assignment);
    } catch (error) {
      console.error('Error creating assignment:', error);
      return res.status(500).json({ error: 'Failed to create assignment' });
    }
  }

  if (req.method === 'DELETE') {
    if (!requireRole(req, res, ['admin', 'manager', 'c-level'])) return;
    try {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Assignment ID required' });
      }

      await PlaylistAssignment.findByIdAndDelete(id);
      return res.status(200).json({ message: 'Assignment deleted' });
    } catch (error) {
      console.error('Error deleting assignment:', error);
      return res.status(500).json({ error: 'Failed to delete assignment' });
    }
  }
}
