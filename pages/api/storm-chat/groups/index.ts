import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../../src/lib/mongodb';
import ChatGroup from '../../../../src/lib/models/ChatGroup';
import { UserModel } from '../../../../src/lib/models/User';
import mongoose from 'mongoose';
import { requireUser, requireRole, allowMethods } from '../../../../src/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;

  await connectMongo();

  if (req.method === 'GET') {
    const auth = requireUser(req, res);
    if (!auth) return;
    try {
      // Use native driver so the `order` field (added after initial schema compile) is always read
      const db = mongoose.connection.db!;
      let groups = await db.collection('chatgroups')
        .find({})
        .sort({ order: 1, createdAt: -1 })
        .toArray();
      // ?mine=1 → only the groups the current user belongs to (including their
      // DMs). Used by the sales/manager chat UI. Without it (admin management
      // view / app all-groups fetch) DMs are excluded entirely, so a user's
      // private threads are never exposed to non-members.
      if (req.query.mine) {
        const me = await UserModel.findOne({ id: auth.sub }, { _id: 1 }).lean() as any;
        const myId = me?._id?.toString();
        const myIds = [auth.sub, myId].filter(Boolean) as string[];
        const isMemberOf = (g: any) =>
          (g.members || []).some((m: string) => myIds.includes(m)) ||
          (g.admins || []).some((m: string) => myIds.includes(m));
        // DMs stay strictly members-only. All other groups (public AND private)
        // are visible to EVERYONE so non-members can find a private group and
        // request to join — each carries an `isMember` flag the UI uses to show
        // the chat vs a "Request to Join" prompt.
        groups = groups
          .filter((g: any) => (g.isDirect ? isMemberOf(g) : true))
          .map((g: any) => (g.isDirect ? g : { ...g, isMember: isMemberOf(g) }));

        // Attach the caller's join-request status for private groups they aren't
        // in yet, so the UI can show Requested / Rejected instead of a fresh Join.
        const GroupJoinRequest = (await import('../../../../src/lib/models/GroupJoinRequest')).default;
        const myReqs = await GroupJoinRequest.find({ userId: myId }).lean() as any[];
        const statusByGroup = new Map(myReqs.map((r) => [String(r.groupId), r.status]));
        groups = groups.map((g: any) =>
          (g.isDirect || g.isMember) ? g : { ...g, joinStatus: statusByGroup.get(String(g._id)) || 'none' }
        );
        // Enrich DMs with the OTHER participant's display info so the client can
        // render the thread with that person's name/avatar (DMs have no name).
        const otherIds = groups
          .filter((g: any) => g.isDirect)
          .map((g: any) => (g.members || []).find((m: string) => m !== myId))
          .filter(Boolean);
        if (otherIds.length) {
          const others = await UserModel.find(
            { _id: { $in: otherIds } }, { _id: 1, name: 1, headshotUrl: 1, role: 1 }
          ).lean() as any[];
          const byId = new Map(others.map(u => [u._id.toString(), u]));
          groups = groups.map((g: any) => {
            if (!g.isDirect) return g;
            const otherId = (g.members || []).find((m: string) => m !== myId);
            const u = otherId ? byId.get(otherId) : null;
            return { ...g, dmOther: u ? { _id: otherId, name: u.name, imageUrl: u.headshotUrl || '', role: u.role } : null };
          });
        }
      } else {
        // Never leak private DM threads into the unfiltered list.
        groups = groups.filter((g: any) => !g.isDirect);
      }

      // WhatsApp-style ordering: the group/DM with the newest message floats to
      // the top. `lastMessageAt` is attached to every group (falling back to the
      // group's own createdAt when it has no messages yet) so the client can
      // show it too. The admin management view opts out with ?manage=1 to keep
      // its manual drag order.
      {
        const ids = groups.map((g: any) => String(g._id));
        const rows = ids.length
          ? await db.collection('chatmessages').aggregate([
              { $match: { groupId: { $in: ids } } },
              { $group: { _id: '$groupId', last: { $max: '$createdAt' } } },
            ]).toArray()
          : [];
        const lastById = new Map(rows.map((r: any) => [String(r._id), r.last]));
        groups = groups.map((g: any) => ({
          ...g,
          lastMessageAt: lastById.get(String(g._id)) || g.createdAt,
        }));
        if (!req.query.manage) {
          groups.sort((a: any, b: any) =>
            new Date(b.lastMessageAt as any).getTime() - new Date(a.lastMessageAt as any).getTime()
          );
        }
      }

      res.status(200).json(groups);
    } catch (error) {
      console.error('Error fetching groups:', error);
      res.status(500).json({ error: 'Failed to fetch groups' });
    }
  } else if (req.method === 'POST') {
    const auth = requireRole(req, res, ['admin', 'sales-team-lead', 'c-level', 'branch-manager']);
    if (!auth) return;
    try {
      const { name, description, imageUrl, members, admins, onlyAdminCanChat, parentGroupId, visibility } = req.body;
      const createdBy = auth.sub;

      if (!name || !members || members.length === 0) {
        return res.status(400).json({ error: 'Name and members are required' });
      }

      // A subgroup's order is scoped to its parent; top-level groups share the
      // global order. Append the new (sub)group at the end of its own list.
      const db = mongoose.connection.db!;
      const orderScope = parentGroupId ? { parentGroupId } : { parentGroupId: { $in: [null, ''] } };
      const last = await db.collection('chatgroups').findOne(orderScope, { sort: { order: -1 } });
      const nextOrder = last && last.order != null ? last.order + 1 : 0;

      const isPublic = visibility === 'public';
      const group = await ChatGroup.create({
        name,
        description: description || '',
        imageUrl: imageUrl || '',
        members,
        admins: admins || [],
        onlyAdminCanChat: onlyAdminCanChat || false,
        visibility: isPublic ? 'public' : 'private',
        createdBy,
        order: nextOrder,
        parentGroupId: parentGroupId || ''
      });

      // A public group contains every account — pull them all in now, then
      // return the refreshed group so the client shows the real member count.
      if (isPublic) {
        const { addAllUsersToGroup } = await import('../../../../src/lib/publicGroups');
        await addAllUsersToGroup(group._id as any);
        const refreshed = await ChatGroup.findById(group._id);
        return res.status(201).json(refreshed || group);
      }

      res.status(201).json(group);
    } catch (error) {
      console.error('Error creating group:', error);
      res.status(500).json({ error: 'Failed to create group' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
