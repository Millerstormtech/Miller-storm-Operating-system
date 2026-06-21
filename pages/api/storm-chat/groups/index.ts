import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../../src/lib/mongodb';
import ChatGroup from '../../../../src/lib/models/ChatGroup';
import mongoose from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method === 'GET') {
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
    try {
      const { name, description, imageUrl, members, admins, onlyAdminCanChat, createdBy } = req.body;

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
