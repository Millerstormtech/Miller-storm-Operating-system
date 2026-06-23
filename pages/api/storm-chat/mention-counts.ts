import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import ChatMessage from '../../../src/lib/models/ChatMessage';
import GroupReadReceipt from '../../../src/lib/models/GroupReadReceipt';
import { requireUser, allowMethods } from '../../../src/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET'])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  try {
    await connectMongo();

    const { groupIds } = req.query;
    const userId = auth.sub;

    if (!groupIds) {
      return res.status(400).json({ error: 'groupIds are required' });
    }

    const groupIdArray = (groupIds as string).split(',');
    
    // Get mention counts for each group
    const mentionCounts: { [key: string]: number } = {};
    
    for (const groupId of groupIdArray) {
      // Get user's last read timestamp for this group
      const readReceipt = await GroupReadReceipt.findOne({ userId, groupId });
      
      if (!readReceipt) {
        // If no read receipt, count all messages that mention the user
        const count = await ChatMessage.countDocuments({
          groupId,
          mentions: userId
        });
        mentionCounts[groupId] = count;
      } else {
        // Count messages after last read time that mention the user
        const count = await ChatMessage.countDocuments({
          groupId,
          mentions: userId,
          createdAt: { $gt: readReceipt.lastReadAt }
        });
        mentionCounts[groupId] = count;
      }
    }

    res.status(200).json(mentionCounts);
  } catch (error) {
    console.error('Error fetching mention counts:', error);
    res.status(500).json({ error: 'Failed to fetch mention counts' });
  }
}
