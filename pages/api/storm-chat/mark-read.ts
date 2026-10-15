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

    // Read up to `upTo` (the newest message the screen actually showed), so a
    // message that lands a moment after the screen refreshed is never marked
    // read unseen. Without upTo, "now". Never in the future, and never moves
    // backwards ($max), so an older tab can't un-read newer messages.
    const now = new Date();
    const asked = req.body.upTo ? new Date(req.body.upTo) : now;
    const readTo = isNaN(asked.getTime()) || asked > now ? now : asked;
    await GroupReadReceipt.findOneAndUpdate(
      { userId, groupId: String(groupId) },
      { $max: { lastReadAt: readTo } },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
}
