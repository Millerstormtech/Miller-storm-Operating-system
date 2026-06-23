import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../src/lib/mongodb';
import { UserModel } from '../../src/lib/models/User';
import { BusinessPlanModel } from '../../src/lib/models/BusinessPlan';
import { requireUser, allowMethods } from '../../src/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;

  await connectMongo();

  if (req.method === 'POST') {
    const auth = requireUser(req, res);
    if (!auth) return;
    // A user saves THEIR OWN plan — trust the session id, ignore any body userId.
    const userId = auth.sub;
    const { businessPlan } = req.body;

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
    const auth = requireUser(req, res);
    if (!auth) return;

    let { managerId, userId } = req.query;

    // Admins and managers may view others (honor provided filters as-is).
    // Regular users (sales/marketing) may only read THEIR OWN plan, so we
    // force the single-user lookup to the authenticated user id and ignore
    // any client-supplied userId/managerId.
    const isPrivileged = auth.role === 'admin' || auth.role === 'manager';
    if (!isPrivileged) {
      userId = auth.sub;
      managerId = undefined;
    }

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
