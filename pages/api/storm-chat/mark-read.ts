import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import GroupReadReceipt from '../../../src/lib/models/GroupReadReceipt';
import { requireUser, allowMethods } from '../../../src/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['POST'])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  try {
    await connectMongo();

    const { groupId } = req.body;
    const userId = auth.sub;

    if (!groupId) {
      return res.status(400).json({ error: 'groupId is required' });
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
