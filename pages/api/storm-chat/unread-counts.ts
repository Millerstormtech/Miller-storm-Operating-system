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
    
    // Batch instead of the old N+1 loop (which ran 2 queries PER group). One
    // query pulls every read receipt; one aggregation counts unread messages per
    // group using an $or of per-group conditions, so each group still applies
    // its own lastReadAt cutoff.
    const receipts = await GroupReadReceipt
      .find({ userId, groupId: { $in: groupIdArray } })
      .select('groupId lastReadAt')
      .lean();
    const lastReadByGroup = new Map<string, Date>(
      (receipts as any[]).map((r) => [r.groupId, r.lastReadAt])
    );

    const orConditions = groupIdArray.map((groupId) => {
      const lastReadAt = lastReadByGroup.get(groupId);
      const cond: any = { groupId, senderId: { $ne: userId } };
      if (lastReadAt) cond.createdAt = { $gt: lastReadAt };
      return cond;
    });

    // Default every requested group to 0 so groups with no unread still appear.
    const unreadCounts: { [key: string]: number } = {};
    groupIdArray.forEach((g) => { unreadCounts[g] = 0; });

    if (orConditions.length > 0) {
      const grouped = await ChatMessage.aggregate([
        { $match: { $or: orConditions } },
        { $group: { _id: '$groupId', count: { $sum: 1 } } }
      ]);
      grouped.forEach((row: any) => { unreadCounts[row._id] = row.count; });
    }

    res.status(200).json(unreadCounts);
  } catch (error) {
    console.error('Error fetching unread counts:', error);
    res.status(500).json({ error: 'Failed to fetch unread counts' });
  }
}
