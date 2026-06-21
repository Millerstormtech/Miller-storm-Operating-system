import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import { UserModel } from '../../../src/lib/models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectMongo();

    const { ids } = req.query;

    if (!ids || typeof ids !== 'string') {
      return res.status(400).json({ error: 'ids parameter is required' });
    }

    // Split comma-separated IDs
    const idArray = ids.split(',').filter(id => id.trim());

    if (idArray.length === 0) {
      return res.status(200).json([]);
    }

    // Fetch all users in a single query
    const users = await UserModel.find({
      _id: { $in: idArray },
      deleted: { $ne: true }
    }).select('_id name email headshotUrl role');

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users by mongo IDs:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}
