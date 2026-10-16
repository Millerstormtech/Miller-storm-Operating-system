import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import { connectMongo } from '../../../../../src/lib/mongodb';
import ChatGroup from '../../../../../src/lib/models/ChatGroup';
import ChatMessage from '../../../../../src/lib/models/ChatMessage';
import { UserModel } from '../../../../../src/lib/models/User';
import { requireUser, allowMethods } from '../../../../../src/lib/auth';
import { isDmGroup } from '../../../../../src/lib/stormchat/isDm';
import { leavePlan } from '../../../../../src/lib/stormchat/leave';

// POST /api/storm-chat/groups/[id]/leave   body: { newAdminId? }
//
// "Leave group", as in GroupMe. Any member may leave. The last group admin
// must hand the role to another member first (newAdminId), so a group never
// ends up with nobody to run it. Leavers go on leftMembers so a public group's
// auto-add doesn't pull them straight back in. Posts a "X left the group" note.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();
  const { id } = req.query;
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
    return res.status(404).json({ error: 'Group not found' });
  }

  try {
    const group = await ChatGroup.findById(id).lean() as any;
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (isDmGroup(group)) {
      return res.status(400).json({ error: 'You can\'t leave a direct message. Use "Delete chat" instead.' });
    }

    const me = await UserModel.findOne({ id: auth.sub }, { _id: 1, name: 1 }).lean() as any;
    const myIds = [auth.sub, me?._id ? String(me._id) : ''].filter(Boolean);
    const newAdminId = typeof req.body?.newAdminId === 'string' ? req.body.newAdminId : undefined;

    const plan = leavePlan(group, myIds, newAdminId);
    if (!plan.ok) return res.status(plan.status).json({ error: plan.error, needsNewAdmin: plan.needsNewAdmin || false });

    await ChatGroup.updateOne({ _id: group._id }, {
      $set: { members: plan.members, admins: plan.admins, leftMembers: plan.leftMembers },
    });

    await ChatMessage.create({
      groupId: String(group._id),
      senderId: 'system',
      senderName: 'System',
      senderRole: 'system',
      message: `${me?.name || 'Someone'} left the group`,
      messageType: 'system',
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error leaving group:', error);
    return res.status(500).json({ error: 'Failed to leave the group' });
  }
}
