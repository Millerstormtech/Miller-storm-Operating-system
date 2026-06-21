import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../src/lib/mongodb';
import { UserModel } from '../../src/lib/models/User';
import { BusinessPlanModel } from '../../src/lib/models/BusinessPlan';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method === 'POST') {
    const { userId, businessPlan, actuals } = req.body;

    try {
      // Update user document with business plan
      await UserModel.updateOne(
        { id: userId },
        { $set: { businessPlan } },
        { upsert: true }
      );

      // Also update separate business plans collection for backward compatibility
      await BusinessPlanModel.updateOne(
        { userId },
        { $set: { ...businessPlan, userId } },
        { upsert: true }
      );

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('❌ Database save error:', error);
      res.status(500).json({ error: 'Failed to save to database' });
    }
  } else if (req.method === 'GET') {
    const { managerId, userId } = req.query;

    try {
      if (userId) {
        // Get single user's plan
        const user = await UserModel.findOne({ id: userId }).lean();
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        const result = [{
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          managerId: user.managerId,
          businessPlan: user.businessPlan || null,
          actuals: null,
          updatedAt: null
        }];
        return res.status(200).json(result);
      }

      // Get all sales users (or filtered by managerId)
      const query: any = {
        role: 'sales',
        deleted: { $ne: true }
      };
      if (managerId) {
        query.managerId = managerId;
      }

      const users = await UserModel.find(query).lean();
      const plansWithUsers = users.map(user => ({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        managerId: user.managerId,
        businessPlan: user.businessPlan || null,
        actuals: null,
        updatedAt: null
      }));

      res.status(200).json(plansWithUsers);
    } catch (error) {
      console.error('Business plans fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch business plans' });
    }
  } else {
    res.setHeader('Allow', ['POST', 'GET']);
    res.status(405).end();
  }
}
