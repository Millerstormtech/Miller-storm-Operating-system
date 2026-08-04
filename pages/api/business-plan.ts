import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../src/lib/mongodb';
import { UserModel } from '../../src/lib/models/User';
import { BusinessPlanModel } from '../../src/lib/models/BusinessPlan';
import { requireUser, allowMethods } from '../../src/lib/auth';
import { buildBusinessPlanUpdate } from '../../src/lib/businessPlan/update';

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
      // Field-level update, not a whole-object replace: a key the caller
      // omits is left alone, so one screen (e.g. a manager editing a rep's
      // legacy funnel fields) can never silently erase fields it knows
      // nothing about (e.g. the rep's own monthly goals). An explicit null
      // on a field clears it; see src/lib/businessPlan/update.ts.
      const userOps = buildBusinessPlanUpdate(businessPlan, 'businessPlan.');
      const userUpdate: Record<string, unknown> = {};
      if (userOps.$set) userUpdate.$set = userOps.$set;
      if (userOps.$unset) userUpdate.$unset = userOps.$unset;

      // Nothing to change (e.g. an empty payload): skip the write rather than
      // sending Mongo an update document with no operators, which it treats
      // as a full replacement document and would wipe the user's record.
      if (Object.keys(userUpdate).length > 0) {
        await UserModel.updateOne({ id: userId }, userUpdate, { upsert: true });
      }

      // Mirror the same fields into the separate legacy business-plans
      // collection, using the same absent/null/zero rules so the two
      // collections can never drift apart. No prefix here: this collection
      // stores the fields flat, not under a `businessPlan` subdocument.
      // userId always comes from the trusted session id, never the payload.
      const mirrorOps = buildBusinessPlanUpdate(businessPlan, '');
      const mirrorUpdate: Record<string, unknown> = {
        $set: { ...(mirrorOps.$set ?? {}), userId }
      };
      if (mirrorOps.$unset) mirrorUpdate.$unset = mirrorOps.$unset;

      await BusinessPlanModel.updateOne({ userId }, mirrorUpdate, { upsert: true });

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
    const isPrivileged = auth.role === 'admin' || auth.role === 'sales-team-lead';
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
