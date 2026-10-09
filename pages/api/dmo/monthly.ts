// POST /api/dmo/monthly — send (or edit) your own monthly DMO: your income goal
// and what you will do this month. Due before midnight Central on the 1st; from
// the last day of a month it collects the NEXT month's.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { DmoMonthlyModel } from "../../../src/lib/models/DmoMonthly";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { DMO_ROLES } from "../../../src/lib/dmo/config";
import { dmoClock, monthlyDeadlines } from "../../../src/lib/dmo/calendar";
import { formMonthFor } from "../../../src/lib/dmo/view";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;
  await connectMongo();

  try {
    const me: any = await UserModel.findOne({ id: auth.sub }).select("id role").lean();
    if (!me) return res.status(404).json({ error: "User not found" });
    if (!(DMO_ROLES as readonly string[]).includes(me.role)) {
      return res.status(403).json({ error: "Only sales roles fill in a DMO." });
    }

    const body = req.body || {};
    const plan = {
      incomeGoal: Number(body.incomeGoal),
      commissionPerRoof: Number(body.commissionPerRoof),
      doors: Number(body.doors),
      claims: Number(body.claims),
      contractDollars: Number(body.contractDollars),
    };
    if (!(plan.incomeGoal > 0) || !(plan.commissionPerRoof > 0)) {
      return res.status(400).json({ error: "Enter your income goal and your average commission per roof." });
    }
    for (const k of ["doors", "claims", "contractDollars"] as const) {
      if (!Number.isFinite(plan[k]) || plan[k] < 0) return res.status(400).json({ error: "Enter a number (0 or more) in every box." });
    }
    if (!Number.isInteger(plan.doors) || !Number.isInteger(plan.claims)) {
      return res.status(400).json({ error: "Doors and claims are whole numbers." });
    }

    const now = new Date();
    const month = formMonthFor(dmoClock(now), now);
    const late = now.getTime() > monthlyDeadlines(month).due.getTime();
    await DmoMonthlyModel.updateOne(
      { userId: me.id, month },
      { $set: plan, $setOnInsert: { submittedAt: now, late } },
      { upsert: true }
    );
    return res.status(200).json({ ok: true, month });
  } catch (err) {
    console.error("[dmo] monthly save failed", err);
    return res.status(500).json({ error: "Could not save your monthly DMO" });
  }
}
