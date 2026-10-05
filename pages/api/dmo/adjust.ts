// POST /api/dmo/adjust — a Team Lead (their team) or Branch Manager (their
// branch) changes a person's commitment for next week, until Friday 5:00 PM
// Central. Every change is kept, so the person sees what they committed and
// what it was changed to (Youssef, 2026-10-05).
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { DmoWeeklyModel } from "../../../src/lib/models/DmoWeekly";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { loadSharedRosterData } from "../../../src/lib/leaderboard/compute";
import { canAdjust } from "../../../src/lib/dmo/load";
import { dmoClock, weeklyDeadlines } from "../../../src/lib/dmo/calendar";
import { WEEKLY_FIELDS } from "../../../src/lib/dmo/config";
import { adjustmentsFor, checkCommitment, type Commitment } from "../../../src/lib/dmo/rules";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;
  await connectMongo();

  try {
    const body = req.body || {};
    const targetId = typeof body.userId === "string" ? body.userId : "";
    const [actor, target]: any[] = await Promise.all([
      UserModel.findOne({ id: auth.sub }).select("id role name territory managerId deleted").lean(),
      UserModel.findOne({ id: targetId, deleted: { $ne: true } }).select("id role name territory managerId deleted").lean(),
    ]);
    if (!actor) return res.status(404).json({ error: "User not found" });
    if (!target) return res.status(404).json({ error: "That person was not found." });

    const shared = await loadSharedRosterData();
    if (!canAdjust(actor, target, shared)) {
      return res.status(403).json({ error: "You can only change commitments for your own team." });
    }

    const now = new Date();
    const clock = dmoClock(now);
    if (now.getTime() >= weeklyDeadlines(clock.weekOf).lock.getTime()) {
      return res.status(409).json({ error: "Next week's numbers locked at 5:00 PM Friday." });
    }

    const doc: any = await DmoWeeklyModel.findOne({ userId: target.id, weekOf: clock.nextWeekOf }).lean();
    if (!doc) {
      return res.status(404).json({ error: target.name ? `${target.name} hasn't sent their weekly DMO yet.` : "They haven't sent their weekly DMO yet." });
    }

    const current = {} as Commitment;
    for (const f of WEEKLY_FIELDS) current[f] = Number(doc[f]) || 0;
    const next: Partial<Commitment> = {};
    for (const f of WEEKLY_FIELDS) if (body[f] !== undefined) next[f] = Number(body[f]);
    // A leader may set any numbers (including below the minimum, e.g. a known
    // day off); only the shape is checked.
    const problem = checkCommitment({ ...current, ...next }, true);
    if (problem) return res.status(400).json({ error: problem });

    const changes = adjustmentsFor(current, next, actor.id, now);
    if (changes.length === 0) return res.status(200).json({ ok: true, changed: 0 });

    const set: Record<string, number> = {};
    for (const c of changes) set[c.field] = c.to;
    await DmoWeeklyModel.updateOne(
      { _id: doc._id },
      { $set: set, $push: { adjustments: { $each: changes } } }
    );
    return res.status(200).json({ ok: true, changed: changes.length });
  } catch (err) {
    console.error("[dmo] adjust failed", err);
    return res.status(500).json({ error: "Could not change the commitment" });
  }
}
