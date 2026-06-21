import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../../src/lib/mongodb';
import mongoose from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  await connectMongo();

  try {
    const { orderedIds } = req.body as { orderedIds: string[] };

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: 'orderedIds array is required' });
    }

    // Use native driver directly to bypass Mongoose strict schema
    const db = mongoose.connection.db!;
    await Promise.all(
      orderedIds.map((id, index) =>
        db.collection('chatgroups').updateOne(
          { _id: new mongoose.Types.ObjectId(id) },
          { $set: { order: index } }
        )
      )
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error reordering groups:', error);
    res.status(500).json({ error: 'Failed to reorder groups' });
  }
}
