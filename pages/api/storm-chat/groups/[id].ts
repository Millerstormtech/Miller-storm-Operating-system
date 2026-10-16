import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../../src/lib/mongodb';
import ChatGroup from '../../../../src/lib/models/ChatGroup';
import { requireUser, allowMethods } from '../../../../src/lib/auth';
import { isDmGroup } from '../../../../src/lib/stormchat/isDm';
import { canSeeGroupInList, canManageGroup, canDeleteGroup, chatRights } from '../../../../src/lib/stormchat/access';
import { viewerIdsFor, isCreatorActive } from '../../../../src/lib/stormchat/viewer';
import ChatMessage from '../../../../src/lib/models/ChatMessage';
import GroupJoinRequest from '../../../../src/lib/models/GroupJoinRequest';
import GroupReadReceipt from '../../../../src/lib/models/GroupReadReceipt';
import { NotificationModel } from '../../../../src/lib/models/Notification';
import mongoose from 'mongoose';
import { UserModel } from '../../../../src/lib/models/User';
import { GROUP_ADMINS_ENABLED } from '../../../../src/lib/stormchat/rollout';

// One group: read it (with the caller's rights), edit it, delete it.
// Permissions follow the GroupMe model (src/lib/stormchat/access.ts): a group's
// own admins (and company Admins) edit it; only its creator deletes it (or a
// company Admin once the creator's account is gone). Job titles give no
// rights here, and a DM is never edited or deleted as a group.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET', 'PUT', 'DELETE'])) return;
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

    const myIds = await viewerIdsFor(auth.sub);
    // Outsiders can't see a DM or an undiscoverable group at all.
    if (!canSeeGroupInList(group, myIds) && !chatRights(group, myIds, auth.role, true).canRead) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const creatorActive = await isCreatorActive(group.createdBy);
    const rights = chatRights(group, myIds, auth.role, creatorActive);

    if (req.method === 'GET') {
      // Non-members of a discoverable group see the card, not who is in it.
      if (!rights.canRead) {
        const { members, admins, dmKey, hiddenFor, leftMembers, ...card } = group;
        return res.status(200).json({ ...card, memberCount: (members || []).length, myRights: rights });
      }
      // myMongoId: the web session only knows the app id, so the screen needs
      // this to tell which member row is the viewer's own.
      const muted = (group.mutedBy || []).map(String).some((m: string) => myIds.includes(m));
      // How many subgroups go with it if this group is deleted (the confirm says so).
      const subgroupCount = rights.canDelete ? await ChatGroup.countDocuments({ parentGroupId: String(group._id) }) : 0;
      // Active people only (not deleted / suspended / leaving): poll totals.
      const memberObjIds = (group.members || []).map(String).filter((m: string) => mongoose.isValidObjectId(m));
      const activeMemberCount = await UserModel.countDocuments({
        _id: { $in: memberObjIds }, deleted: { $ne: true }, suspended: { $ne: true }, deletionRequested: { $ne: true },
      });
      return res.status(200).json({ ...group, myRights: rights, myMongoId: myIds[1] || '', muted, subgroupCount, activeMemberCount });
    }

    if (isDmGroup(group)) {
      return res.status(400).json({ error: 'A direct message cannot be edited or deleted as a group' });
    }

    if (req.method === 'PUT') {
      if (!canManageGroup(group, myIds, auth.role)) {
        return res.status(403).json({ error: 'Only this group\'s admins can change it' });
      }
      const { name, description, imageUrl, members, admins, onlyAdminCanChat, visibility } = req.body || {};

      // Change only what was sent, so editing one setting never wipes another.
      const update: any = {};
      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name is required' });
        update.name = name.trim();
      }
      if (description !== undefined) update.description = String(description || '');
      if (imageUrl !== undefined) update.imageUrl = String(imageUrl || '');
      if (onlyAdminCanChat !== undefined) update.onlyAdminCanChat = !!onlyAdminCanChat;
      if (visibility === 'public' || visibility === 'private') update.visibility = visibility;

      const nextMembers: string[] = members !== undefined ? members : (group.members || []);
      if (members !== undefined) {
        if (!Array.isArray(members) || members.length === 0 || !members.every((m: any) => typeof m === 'string')) {
          return res.status(400).json({ error: 'A group needs at least one member' });
        }
        update.members = Array.from(new Set(members.map(String)));
        // Removed people stay out of a public group's auto-add; anyone added
        // back is cleared from that list (GroupMe: removed until re-added).
        const now = new Set(update.members as string[]);
        const removed = (group.members || []).map(String).filter((m: string) => !now.has(m));
        update.leftMembers = Array.from(new Set([...(group.leftMembers || []).map(String), ...removed]))
          .filter((m) => !now.has(m));
      }
      if (admins !== undefined) {
        if (!Array.isArray(admins) || !admins.every((a: any) => typeof a === 'string')) {
          return res.status(400).json({ error: 'admins must be a list of user ids' });
        }
        // A group admin must be in the group.
        const inGroup = new Set(nextMembers.map(String));
        update.admins = Array.from(new Set(admins.map(String))).filter((a) => inGroup.has(a));
        // While group admins are paused, nobody new can be made admin.
        if (!GROUP_ADMINS_ENABLED) {
          const current = new Set((group.admins || []).map(String));
          update.admins = update.admins.filter((a: string) => current.has(a));
        }
      } else if (members !== undefined) {
        // Removing someone also drops their admin role.
        const inGroup = new Set(update.members);
        update.admins = (group.admins || []).map(String).filter((a: string) => inGroup.has(a));
      }

      // A group with people in it always keeps at least one admin. To step
      // down as the last admin, use Leave (it makes you hand over first).
      const finalMembers: string[] = update.members ?? (group.members || []).map(String);
      const finalAdmins: string[] = update.admins ?? (group.admins || []).map(String);
      const hadAdmins = (group.admins || []).length > 0; // older groups may have none
      if (hadAdmins && finalMembers.length > 0 && finalAdmins.length === 0) {
        return res.status(400).json({ error: 'A group needs at least one admin. Make someone else admin first.' });
      }

      const saved = await ChatGroup.findByIdAndUpdate(id, update, { new: true });
      if (!saved) return res.status(404).json({ error: 'Group not found' });

      // If it's now public, make sure every account is a member.
      if (update.visibility === 'public') {
        const { addAllUsersToGroup } = await import('../../../../src/lib/publicGroups');
        await addAllUsersToGroup(id);
        const refreshed = await ChatGroup.findById(id);
        return res.status(200).json(refreshed || saved);
      }
      return res.status(200).json(saved);
    }

    // DELETE
    if (!canDeleteGroup(group, myIds, auth.role, creatorActive)) {
      return res.status(403).json({ error: 'Only the person who created this group can delete it' });
    }
    // Delete the group AND everything that belongs to it, its subgroups
    // included (Youssef, 2026-10-15): messages, join requests, read status
    // and bell alerts used to be left behind, and subgroups were orphaned.
    // Uploaded files stay: a forwarded copy elsewhere may still point at them.
    const subgroups = await ChatGroup.find({ parentGroupId: String(group._id) }, { _id: 1 }).lean() as any[];
    const ids = [String(group._id), ...subgroups.map((g) => String(g._id))];
    await Promise.all([
      ChatMessage.deleteMany({ groupId: { $in: ids } }),
      GroupJoinRequest.deleteMany({ groupId: { $in: ids } }),
      GroupReadReceipt.deleteMany({ groupId: { $in: ids } }),
      NotificationModel.deleteMany({ 'metadata.groupId': { $in: ids } }),
    ]);
    await ChatGroup.deleteMany({ _id: { $in: ids } });
    return res.status(200).json({ message: 'Group deleted successfully', deletedGroups: ids.length });
  } catch (error) {
    console.error('Error in group handler:', error);
    return res.status(500).json({ error: 'Something went wrong with this group' });
  }
}
