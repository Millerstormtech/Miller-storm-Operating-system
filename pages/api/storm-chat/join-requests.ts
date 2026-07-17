import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import ChatGroup from '../../../src/lib/models/ChatGroup';
import GroupJoinRequest from '../../../src/lib/models/GroupJoinRequest';
import { UserModel } from '../../../src/lib/models/User';
import { NotificationModel } from '../../../src/lib/models/Notification';
import { requireUser, allowMethods } from '../../../src/lib/auth';

// Join-request flow for PRIVATE StormChat groups:
//   POST   { groupId }               → a user asks to join (creates a pending request, notifies group admins)
//   GET    [?groupId=]               → pending requests (for a group, or across all groups the caller admins)
//   PATCH  { requestId, action }     → a group admin approves/denies (approve adds the user to members)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH'])) return;
  const auth = requireUser(req, res);
  if (!auth) return;
  await connectMongo();

  const me = await UserModel.findOne({ id: auth.sub }, { _id: 1, name: 1, role: 1 }).lean() as any;
  const myMongoId = me?._id?.toString() || '';
  const isSystemAdmin = auth.role === 'admin';

  const notify = async (appUserId: string, type: string, title: string, message: string, metadata: any) => {
    if (!appUserId) return;
    try {
      await NotificationModel.create({
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        userId: appUserId, type, title, message, read: false, metadata,
      });
    } catch (e) { console.error('[join-requests] notify failed:', e); }
  };

  try {
    if (req.method === 'POST') {
      const { groupId } = req.body || {};
      if (!groupId) return res.status(400).json({ error: 'groupId is required' });
      const group = await ChatGroup.findById(groupId).lean() as any;
      if (!group) return res.status(404).json({ error: 'Group not found' });

      const memberIds = (group.members || []).map(String);
      if (myMongoId && memberIds.includes(myMongoId)) {
        return res.status(200).json({ ok: true, alreadyMember: true });
      }

      // A previously DENIED request cannot be re-sent — the admin rejected it.
      const existing = await GroupJoinRequest.findOne({ groupId: String(groupId), userId: myMongoId }).lean() as any;
      if (existing && existing.status === 'denied') {
        return res.status(403).json({ error: 'denied', message: "Your request was rejected by the admin. You can't access this group." });
      }

      const request = await GroupJoinRequest.findOneAndUpdate(
        { groupId: String(groupId), userId: myMongoId },
        {
          groupId: String(groupId), groupName: group.name || '',
          userId: myMongoId, appUserId: auth.sub,
          userName: me?.name || '', userRole: me?.role || '', status: 'pending',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Notify the group's admins (by their app ids). Fall back to system admins
      // if the group has none, so a request is never invisible.
      let adminMongoIds = (group.admins || []).map(String);
      let adminApps: string[] = [];
      if (adminMongoIds.length) {
        const admins = await UserModel.find({ _id: { $in: adminMongoIds } }, { id: 1 }).lean() as any[];
        adminApps = admins.map(a => a.id).filter(Boolean);
      }
      if (!adminApps.length) {
        const sysAdmins = await UserModel.find({ role: 'admin', deleted: { $ne: true } }, { id: 1 }).lean() as any[];
        adminApps = sysAdmins.map(a => a.id).filter(Boolean);
      }
      await Promise.all(adminApps.map(appId =>
        notify(appId, 'group_join_request', `Join request: ${group.name}`,
          `${me?.name || 'A user'} wants to join "${group.name}"`,
          { groupId: String(groupId), groupName: group.name, requestId: String(request._id) })
      ));

      return res.status(200).json({ ok: true, request });
    }

    if (req.method === 'GET') {
      const { groupId } = req.query;
      if (groupId) {
        const reqs = await GroupJoinRequest.find({ groupId: String(groupId), status: 'pending' })
          .sort({ createdAt: -1 }).lean();
        return res.status(200).json(reqs);
      }
      // All pending requests for groups the caller can approve.
      if (isSystemAdmin) {
        const reqs = await GroupJoinRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean();
        return res.status(200).json(reqs);
      }
      const myGroups = await ChatGroup.find({ admins: myMongoId }, { _id: 1 }).lean() as any[];
      const ids = myGroups.map(g => g._id.toString());
      const reqs = await GroupJoinRequest.find({ groupId: { $in: ids }, status: 'pending' })
        .sort({ createdAt: -1 }).lean();
      return res.status(200).json(reqs);
    }

    if (req.method === 'PATCH') {
      const { requestId, action } = req.body || {};
      if (!requestId || (action !== 'approve' && action !== 'deny')) {
        return res.status(400).json({ error: 'requestId and action (approve|deny) are required' });
      }
      const jr: any = await GroupJoinRequest.findById(requestId);
      if (!jr) return res.status(404).json({ error: 'Request not found' });
      const group: any = await ChatGroup.findById(jr.groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });

      // Only a system admin or one of the group's admins may decide.
      const groupAdminIds = (group.admins || []).map(String);
      if (!isSystemAdmin && !(myMongoId && groupAdminIds.includes(myMongoId))) {
        return res.status(403).json({ error: 'Not authorized to decide this request' });
      }

      if (action === 'approve') {
        if (!(group.members || []).map(String).includes(String(jr.userId))) {
          group.members.push(jr.userId);
          await group.save();
        }
        jr.status = 'approved';
        await jr.save();
        await notify(jr.appUserId, 'group_join_approved', `You're in: ${group.name}`,
          `Your request to join "${group.name}" was approved.`,
          { groupId: String(jr.groupId), groupName: group.name });
      } else {
        jr.status = 'denied';
        await jr.save();
        await notify(jr.appUserId, 'group_join_denied', `Request declined: ${group.name}`,
          `Your request to join "${group.name}" was rejected by the admin. You can't access this group.`,
          { groupId: String(jr.groupId), groupName: group.name });
      }

      return res.status(200).json({ ok: true, status: jr.status });
    }
  } catch (error) {
    console.error('[join-requests] error:', error);
    return res.status(500).json({ error: 'Failed to process join request' });
  }
}
