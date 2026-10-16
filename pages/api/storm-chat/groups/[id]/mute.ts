import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import { connectMongo } from '../../../../../src/lib/mongodb';
import ChatGroup from '../../../../../src/lib/models/ChatGroup';
import { requireUser, allowMethods } from '../../../../../src/lib/auth';
import { chatRights } from '../../../../../src/lib/stormchat/access';
import { viewerIdsFor } from '../../../../../src/lib/stormchat/viewer';

// POST /api/storm-chat/groups/[id]/mute   body: { muted: boolean }
//
// Mute a chat for yourself (GroupMe-style): no alert or phone push for
// ordinary messages; @mentions (and @all from an admin) still come through,
// and the unread number still counts. Anyone in the chat, DMs included.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();
  const { id } = req.query;
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
    return res.status(404).json({ error: 'Chat not found' });
  }
  if (typeof req.body?.muted !== 'boolean') {
    return res.status(400).json({ error: 'muted (true or false) is required' });
  }

  try {
    const group = await ChatGroup.findById(id).lean() as any;
    const myIds = await viewerIdsFor(auth.sub);
    if (!group || !chatRights(group, myIds, auth.role, true).isMember) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    const me = myIds[1]; // Mongo _id, the form members are stored in
    if (!me) return res.status(404).json({ error: 'Chat not found' });
    await ChatGroup.updateOne(
      { _id: group._id },
      req.body.muted ? { $addToSet: { mutedBy: me } } : { $pull: { mutedBy: me } },
    );
    return res.status(200).json({ muted: req.body.muted });
  } catch (error) {
    console.error('Error muting chat:', error);
    return res.status(500).json({ error: 'Failed to change mute' });
  }
}
