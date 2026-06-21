import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../src/lib/mongodb';
import Playlist from '../../src/lib/models/Playlist';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method === 'GET') {
    try {
      const { managerId } = req.query;
      
      if (!managerId) {
        return res.status(400).json({ error: 'Manager ID required' });
      }
      
      const playlists = await Playlist.find({ managerId }).sort({ createdAt: -1 });
      return res.status(200).json(playlists);
    } catch (error) {
      console.error('Error fetching playlists:', error);
      return res.status(500).json({ error: 'Failed to fetch playlists' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, courseId, courseName, selectedModules, managerId, managerName } = req.body;

      if (!name || !courseId || !managerId || !selectedModules || selectedModules.length === 0) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const playlist = await Playlist.create({
        name,
        courseId,
        courseName,
        selectedModules,
        managerId,
        managerName,
      });

      return res.status(201).json(playlist);
    } catch (error) {
      console.error('Error creating playlist:', error);
      return res.status(500).json({ error: 'Failed to create playlist' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { id, name, selectedModules } = req.body;

      if (!id || !name || !selectedModules || selectedModules.length === 0) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const playlist = await Playlist.findByIdAndUpdate(
        id,
        { name, selectedModules },
        { new: true }
      );

      if (!playlist) {
        return res.status(404).json({ error: 'Playlist not found' });
      }

      return res.status(200).json(playlist);
    } catch (error) {
      console.error('Error updating playlist:', error);
      return res.status(500).json({ error: 'Failed to update playlist' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Playlist ID required' });
      }

      await Playlist.findByIdAndDelete(id);
      return res.status(200).json({ message: 'Playlist deleted' });
    } catch (error) {
      console.error('Error deleting playlist:', error);
      return res.status(500).json({ error: 'Failed to delete playlist' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
