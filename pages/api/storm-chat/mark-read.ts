import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import GroupReadReceipt from '../../../src/lib/models/GroupReadReceipt';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectMongo();

    const { userId, groupId } = req.body;

    if (!userId || !groupId) {
      return res.status(400).json({ error: 'userId and groupId are required' });
    }

    // Update or create read receipt
    await GroupReadReceipt.findOneAndUpdate(
      { userId, groupId },
      { lastReadAt: new Date() },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
}
