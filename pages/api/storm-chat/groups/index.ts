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
      // ?mine=1 → only the groups the current user belongs to. Used by the
      // sales/manager chat UI so a user sees only their own groups (the admin
      // management view still requests the full, unfiltered list).
      if (req.query.mine) {
        const me = await UserModel.findOne({ id: auth.sub }, { _id: 1 }).lean() as any;
        const myIds = [auth.sub, me?._id?.toString()].filter(Boolean) as string[];
        groups = groups.filter((g: any) =>
          (g.members || []).some((m: string) => myIds.includes(m)) ||
          (g.admins || []).some((m: string) => myIds.includes(m))
        );
      }
      res.status(200).json(groups);
    } catch (error) {
      console.error('Error fetching groups:', error);
      res.status(500).json({ error: 'Failed to fetch groups' });
    }
  } else if (req.method === 'POST') {
    const auth = requireRole(req, res, ['admin', 'manager']);
    if (!auth) return;
    try {
      const { name, description, imageUrl, members, admins, onlyAdminCanChat, parentGroupId } = req.body;
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

      const group = await ChatGroup.create({
        name,
        description: description || '',
        imageUrl: imageUrl || '',
        members,
        admins: admins || [],
        onlyAdminCanChat: onlyAdminCanChat || false,
        createdBy,
        order: nextOrder,
        parentGroupId: parentGroupId || ''
      });

      res.status(201).json(group);
    } catch (error) {
      console.error('Error creating group:', error);
      res.status(500).json({ error: 'Failed to create group' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
