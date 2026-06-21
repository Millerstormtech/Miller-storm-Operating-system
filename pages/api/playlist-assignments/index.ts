import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import PlaylistAssignment from '../../../src/lib/models/PlaylistAssignment';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method === 'GET') {
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

      return res.status(201).json(assignment);
    } catch (error) {
      console.error('Error creating assignment:', error);
      return res.status(500).json({ error: 'Failed to create assignment' });
    }
  }

  if (req.method === 'DELETE') {
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

  return res.status(405).json({ error: 'Method not allowed' });
}
