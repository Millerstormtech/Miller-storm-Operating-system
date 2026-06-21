import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../../src/lib/mongodb';
import ChatGroup from '../../../../src/lib/models/ChatGroup';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      const group = await ChatGroup.findById(id);
      
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      res.status(200).json(group);
    } catch (error) {
      console.error('Error fetching group:', error);
      res.status(500).json({ error: 'Failed to fetch group' });
    }
  } else if (req.method === 'PUT') {
    try {
      const { name, description, imageUrl, members, admins, onlyAdminCanChat } = req.body;
      
      if (!name || !members || members.length === 0) {
        return res.status(400).json({ error: 'Name and members are required' });
      }

      const group = await ChatGroup.findByIdAndUpdate(
        id,
        {
          name,
          description: description || '',
          imageUrl: imageUrl || '',
          members,
          admins: admins || [],
          onlyAdminCanChat: onlyAdminCanChat || false
        },
        { new: true }
      );

      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      res.status(200).json(group);
    } catch (error) {
      console.error('Error updating group:', error);
      res.status(500).json({ error: 'Failed to update group' });
    }
  } else if (req.method === 'DELETE') {
    try {
      const group = await ChatGroup.findByIdAndDelete(id);

      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      res.status(200).json({ message: 'Group deleted successfully' });
    } catch (error) {
      console.error('Error deleting group:', error);
      res.status(500).json({ error: 'Failed to delete group' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
