import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../../src/lib/mongodb';
import ChatGroup from '../../../../src/lib/models/ChatGroup';
import mongoose from 'mongoose';
import { requireUser, requireRole, allowMethods } from '../../../../src/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;

  await connectMongo();

  if (req.method === 'GET') {
    if (!requireUser(req, res)) return;
    try {
      // Use native driver so the `order` field (added after initial schema compile) is always read
      const db = mongoose.connection.db!;
      const groups = await db.collection('chatgroups')
        .find({})
        .sort({ order: 1, createdAt: -1 })
        .toArray();
      res.status(200).json(groups);
    } catch (error) {
      console.error('Error fetching groups:', error);
      res.status(500).json({ error: 'Failed to fetch groups' });
    }
  } else if (req.method === 'POST') {
    const auth = requireRole(req, res, ['admin', 'manager']);
    if (!auth) return;
    try {
      const { name, description, imageUrl, members, admins, onlyAdminCanChat } = req.body;
      const createdBy = auth.sub;

      if (!name || !members || members.length === 0) {
        return res.status(400).json({ error: 'Name and members are required' });
      }

      // Get current max order to append new group at end
      const db = mongoose.connection.db!;
      const last = await db.collection('chatgroups').findOne({}, { sort: { order: -1 } });
      const nextOrder = last && last.order != null ? last.order + 1 : 0;

      const group = await ChatGroup.create({
        name,
        description: description || '',
        imageUrl: imageUrl || '',
        members,
        admins: admins || [],
        onlyAdminCanChat: onlyAdminCanChat || false,
        createdBy,
        order: nextOrder
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
