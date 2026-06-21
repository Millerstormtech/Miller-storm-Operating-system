import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import ChatMessage from '../../../src/lib/models/ChatMessage';
import GroupReadReceipt from '../../../src/lib/models/GroupReadReceipt';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectMongo();

    const { userId, groupIds } = req.query;

    if (!userId || !groupIds) {
      return res.status(400).json({ error: 'userId and groupIds are required' });
    }

    const groupIdArray = (groupIds as string).split(',');
    
    // Get unread counts for each group
    const unreadCounts: { [key: string]: number } = {};
    
    for (const groupId of groupIdArray) {
      // Get user's last read timestamp for this group
      const readReceipt = await GroupReadReceipt.findOne({ userId, groupId });
      
      if (!readReceipt) {
        // If no read receipt, count all messages not sent by user
        const count = await ChatMessage.countDocuments({
          groupId,
          senderId: { $ne: userId }
        });
        unreadCounts[groupId] = count;
      } else {
        // Count messages after last read time, not sent by user
        const count = await ChatMessage.countDocuments({
          groupId,
          senderId: { $ne: userId },
          createdAt: { $gt: readReceipt.lastReadAt }
        });
        unreadCounts[groupId] = count;
      }
    }

    res.status(200).json(unreadCounts);
  } catch (error) {
    console.error('Error fetching unread counts:', error);
    res.status(500).json({ error: 'Failed to fetch unread counts' });
  }
}
