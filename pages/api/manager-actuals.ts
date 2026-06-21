import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../src/lib/mongodb';
import mongoose from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const { managerId, actualData, month, year } = req.body;

      if (!managerId || !actualData) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      await connectMongo();
      const db = mongoose.connection.db;
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const updateData = {
        managerId,
        month,
        year,
        dealsActual: actualData.dealsActual,
        claimsActual: actualData.claimsActual,
        inspectionsActual: actualData.inspectionsActual,
        updatedAt: new Date()
      };

      // Upsert (update or insert) the record
      const result = await db.collection('managerActuals').updateOne(
        { managerId, month, year },
        { $set: updateData },
        { upsert: true }
      );

      console.log('✅ Manager actuals save result:', result);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('❌ Error saving manager actuals:', error);
      return res.status(500).json({ error: 'Failed to save actuals' });
    }
  } else if (req.method === 'GET') {
    try {
      const { managerId, month, year } = req.query;

      if (!managerId) {
        return res.status(400).json({ error: 'Manager ID is required' });
      }

      await connectMongo();
      const db = mongoose.connection.db;
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const query: any = { managerId: managerId as string };
      
      if (month) query.month = parseInt(month as string);
      if (year) query.year = parseInt(year as string);

      const actuals = await db.collection('managerActuals')
        .find(query)
        .sort({ year: -1, month: -1 })
        .toArray();

      return res.status(200).json(actuals);
    } catch (error) {
      console.error('❌ Error fetching manager actuals:', error);
      return res.status(500).json({ error: 'Failed to fetch actuals' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
}