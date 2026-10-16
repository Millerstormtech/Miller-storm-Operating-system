import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import { connectMongo } from '../../../src/lib/mongodb';
import { UserModel } from '../../../src/lib/models/User';
import { requireUser, allowMethods } from '../../../src/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET'])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  try {
    await connectMongo();

    const { ids } = req.query;

    if (!ids || typeof ids !== 'string') {
      return res.status(400).json({ error: 'ids parameter is required' });
    }

    // Split comma-separated IDs
    // Malformed ids are skipped (they used to crash the lookup with a 500).
    const idArray = ids.split(',').map(id => id.trim()).filter(id => mongoose.isValidObjectId(id));

    if (idArray.length === 0) {
      return res.status(200).json([]);
    }

    // Fetch all users in a single query
    const users = await UserModel.find({
      _id: { $in: idArray },
      deleted: { $ne: true }
    }).select('_id name headshotUrl role'); // no emails: any user can call this

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users by mongo IDs:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}
