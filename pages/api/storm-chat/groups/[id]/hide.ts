import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../../../src/lib/mongodb';
import ChatGroup from '../../../../../src/lib/models/ChatGroup';
import { UserModel } from '../../../../../src/lib/models/User';
import { requireUser, allowMethods } from '../../../../../src/lib/auth';
import { isDmGroup } from '../../../../../src/lib/stormchat/isDm';

// POST /api/storm-chat/groups/[id]/hide
//
// "Delete chat for me" on a 1-on-1 DM: the caller (who must be one of the two
// members) is added to the group's hiddenFor list, so the thread drops out of
// THEIR chat list only. The other person keeps it, and a new message clears
// hiddenFor (see messages/[groupId].ts) so a hidden DM comes back on fresh
// activity — same behaviour as "delete chat" in WhatsApp. Only DMs use this;
// real groups are deleted through the role-gated DELETE on [id].ts.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();
  const { id } = req.query;

  try {
    const group = await ChatGroup.findById(id).lean() as any;
    if (!group) return res.status(404).json({ error: 'Chat not found' });
    if (!isDmGroup(group)) {
      return res.status(400).json({ error: 'Only direct messages can be deleted this way' });
    }

    // The caller may appear in members by their user id OR their mongo _id, so
    // resolve both and require a match — a non-member can never hide someone
    // else's private thread.
    const me = await UserModel.findOne({ id: auth.sub }, { _id: 1 }).lean() as any;
    const myIds = [auth.sub, me?._id?.toString()].filter(Boolean) as string[];
    const isMember = (group.members || []).some((m: string) => myIds.includes(m));
    if (!isMember) return res.status(403).json({ error: 'Forbidden' });

    // Add every id the caller might match by, so the list filter hides it.
    await ChatGroup.updateOne({ _id: id }, { $addToSet: { hiddenFor: { $each: myIds } } });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error hiding DM:', error);
    return res.status(500).json({ error: 'Failed to delete chat' });
  }
}
