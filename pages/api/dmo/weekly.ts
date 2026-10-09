// POST /api/dmo/weekly — send (or edit) your own weekly DMO: what you will do
// next week. Due Friday 1:00 PM Central; after that it still saves, marked
// late. Your own edits close at Friday 5:00 PM, when the team totals lock,
// unless you have not sent one at all yet.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { DmoWeeklyModel } from "../../../src/lib/models/DmoWeekly";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { loadDmo } from "../../../src/lib/dmo/load";
import { DMO_ROLES } from "../../../src/lib/dmo/config";
import { awayDaysInWeek, checkCommitment, type Away } from "../../../src/lib/dmo/rules";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function readAway(raw: any): Away | null | "invalid" {
  if (!raw || (!raw.from && !raw.to)) return null;
  const from = String(raw.from || "");
  const to = String(raw.to || "");
  if (!DAY.test(from) || !DAY.test(to) || to < from) return "invalid";
  return { from, to, reason: String(raw.reason || "").slice(0, 200) };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;
  await connectMongo();

  try {
    const me: any = await UserModel.findOne({ id: auth.sub }).select("id role name territory").lean();
    if (!me) return res.status(404).json({ error: "User not found" });
    if (!(DMO_ROLES as readonly string[]).includes(me.role)) {
      return res.status(403).json({ error: "Only sales roles fill in a DMO." });
    }

    const now = new Date();
    const board = await loadDmo({ id: me.id, role: "sales", name: me.name, territory: me.territory }, now);
    const mine = board.me;
    if (!mine) return res.status(404).json({ error: "Your account is not on the org chart yet." });
    const form = mine.weeklyForm;

    if (form.state === "not-open") {
      return res.status(409).json({ error: "This week's DMO opens on Thursday." });
    }
    if (form.commitment && !form.canAdjust) {
      return res.status(409).json({ error: "Next week's numbers locked at 5:00 PM Friday." });
    }

    const body = req.body || {};
    const away = readAway(body.away);
    if (away === "invalid") return res.status(400).json({ error: "Check the away dates." });
    const numbers = {
      doors: Number(body.doors),
      claims: Number(body.claims),
      contracts: Number(body.contracts),
      contractDollars: Number(body.contractDollars),
    };
    const awayAllWeek = awayDaysInWeek(form.forWeekOf, away).length === 7;
    const problem = checkCommitment(numbers, form.floorExempt || awayAllWeek);
    if (problem) return res.status(400).json({ error: problem });

    const late = now.getTime() > new Date(form.due).getTime();
    await DmoWeeklyModel.updateOne(
      { userId: me.id, weekOf: form.forWeekOf },
      {
        $set: { ...numbers, away },
        // The first send decides on-time vs late; later edits do not change it.
        $setOnInsert: { submittedAt: now, late },
      },
      { upsert: true }
    );
    return res.status(200).json({ ok: true, weekOf: form.forWeekOf, late: form.commitment ? form.commitment.late : late });
  } catch (err) {
    console.error("[dmo] weekly save failed", err);
    return res.status(500).json({ error: "Could not save your weekly DMO" });
  }
}
