import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../src/lib/mongodb';
import { UserModel } from '../../src/lib/models/User';
import { BusinessPlanModel } from '../../src/lib/models/BusinessPlan';
import { requireUser, allowMethods } from '../../src/lib/auth';
import { buildBusinessPlanUpdate } from '../../src/lib/businessPlan/update';
import {
  resolveBusinessPlanWrite,
  buildAuthorizedPlanPayload,
  isValidRequestedUserId
} from '../../src/lib/businessPlan/authorization';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;

  await connectMongo();

  if (req.method === 'POST') {
    const auth = requireUser(req, res);
    if (!auth) return;
    const { businessPlan, userId: requestedUserId } = req.body;

    // req.body is `any`, so nothing at the type level stops a client from
    // sending a Mongo operator object (e.g. { "$ne": "x" }) instead of a
    // real id string. Reject that BEFORE any DB read/write -- both the
    // target lookup below and the eventual UserModel.updateOne({ id: userId
    // }, ...) would otherwise turn a non-string value straight into a raw
    // Mongo filter.
    if (!isValidRequestedUserId(requestedUserId)) {
      return res.status(400).json({ error: 'userId must be a string' });
    }

    // A rep saves THEIR OWN plan by default — the trusted session id, not
    // any body userId. admin and sales-team-lead (the same "privileged"
    // roles the GET branch above already recognizes) may additionally save
    // ANOTHER user's plan, which is what lets a team lead's mobile screens
    // (sales_team_lead_planner_screen.dart,
    // sales_team_lead_team_member_detail_screen.dart) actually save a rep's
    // plan instead of silently overwriting the team lead's own record. See
    // src/lib/businessPlan/authorization.ts for the full decision, including
    // why a sales-team-lead is scoped to their own reports (managerId match)
    // while admin is not, and why the three monthly goal fields always get
    // stripped once the write target isn't the caller.
    let targetExists: boolean | undefined;
    let targetManagerId: string | null | undefined;
    if (
      (auth.role === 'admin' || auth.role === 'sales-team-lead') &&
      requestedUserId &&
      requestedUserId !== auth.sub
    ) {
      // Looked up for BOTH privileged roles, not just sales-team-lead: admin
      // is otherwise unscoped, so this existence check is its only defense
      // against the upsert:true write below silently creating a phantom
      // user from a typo'd or fabricated id. For sales-team-lead this also
      // supplies the managerId the scope check needs.
      const targetUser = await UserModel.findOne({ id: requestedUserId })
        .select('managerId')
        .lean();
      targetExists = !!targetUser;
      targetManagerId = targetUser?.managerId ?? null;
    }

    const decision = resolveBusinessPlanWrite({
      authUserId: auth.sub,
      authRole: auth.role,
      requestedUserId,
      targetExists,
      targetManagerId
    });

    if (!decision.allowed) {
      if (decision.reason === 'not-found') {
        // Same convention the GET branch below already uses for a
        // privileged caller's nonexistent single-user lookup. Not a new
        // leak: GET already reveals existence to privileged roles, and this
        // branch is only reachable for admin/sales-team-lead in the first
        // place (a non-privileged caller never triggers the DB lookup
        // above, so it can only ever get 'forbidden').
        return res.status(404).json({ error: 'User not found' });
      }
      // Same response whether the target is out of the caller's scope or
      // (for a non-privileged caller) simply someone else entirely, so a
      // probing caller can never use this endpoint to learn which user ids
      // exist or who reports to whom.
      return res.status(403).json({ error: 'Forbidden' });
    }

    const userId = decision.targetUserId;
    // "Each person sets their own goals": buildAuthorizedPlanPayload is the
    // ONLY place that strips the three monthly goal fields, and the handler
    // routes every write through it rather than re-deriving the strip
    // decision inline here. See src/lib/businessPlan/authorization.ts for
    // why that single call site matters.
    const planPayload = buildAuthorizedPlanPayload(decision, businessPlan);

    try {
      // Field-level update, not a whole-object replace: a key the caller
      // omits is left alone, so one screen (e.g. a manager editing a rep's
      // legacy funnel fields) can never silently erase fields it knows
      // nothing about (e.g. the rep's own monthly goals). An explicit null
      // on a field clears it; see src/lib/businessPlan/update.ts.
      const userOps = buildBusinessPlanUpdate(planPayload, 'businessPlan.');
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
      // userId is always `decision.targetUserId` above, never read again
      // from the raw request body here.
      const mirrorOps = buildBusinessPlanUpdate(planPayload, '');
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
