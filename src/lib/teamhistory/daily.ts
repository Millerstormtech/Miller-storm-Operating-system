// src/lib/teamhistory/daily.ts
// I/O only: per-rep, per-Central-day totals for the few reps whose numbers must
// be split by team (movers inside a range, or one rep for an admin preview).
// Caller must connectMongo() first.
import { ScoringFactModel } from "../models/ScoringFact";
import { RepCardKnockFactModel } from "../models/RepCardKnockFact";
import type { DayTotals } from "./segments";

const DAY = { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt", timezone: "America/Chicago" } };

export async function loadDailyTotals(input: {
  rcIds: string[];
  acxIdsByRc: Map<string, string[]>;
  start: Date;
  end: Date;
}): Promise<Map<string, DayTotals[]>> {
  const { rcIds, acxIdsByRc, start, end } = input;
  if (rcIds.length === 0) return new Map();
  const out = new Map<string, Map<string, DayTotals>>();
  const cell = (rc: string, day: string) => {
    let m = out.get(rc);
    if (!m) { m = new Map(); out.set(rc, m); }
    let d = m.get(day);
    if (!d) { d = { day, verifiedKnocks: 0, leadsCreated: 0, filed: 0, won: 0, revenue: 0 }; m.set(day, d); }
    return d;
  };
  const rcByAcx = new Map<string, string>();
  for (const [rc, ids] of acxIdsByRc) for (const id of ids) rcByAcx.set(id, rc);

  const [knocks, sales] = await Promise.all([
    RepCardKnockFactModel.aggregate([
      { $match: { repcardUserId: { $in: rcIds }, occurredAt: { $gte: start, $lte: end } } },
      { $group: { _id: { rc: "$repcardUserId", day: DAY }, n: { $sum: "$verifiedKnocks" } } },
    ]),
    rcByAcx.size
      ? ScoringFactModel.aggregate([
          { $match: { repExternalId: { $in: [...rcByAcx.keys()] }, occurredAt: { $gte: start, $lte: end } } },
          { $group: { _id: { acx: "$repExternalId", day: DAY, metric: "$metric" }, v: { $sum: "$value" } } },
        ])
      : Promise.resolve([] as any[]),
  ]);

  for (const k of knocks as any[]) cell(String(k._id.rc), k._id.day).verifiedKnocks += Number(k.n) || 0;
  for (const s of sales as any[]) {
    const rc = rcByAcx.get(String(s._id.acx));
    if (!rc) continue;
    const d = cell(rc, s._id.day);
    const v = Number(s.v) || 0;
    if (s._id.metric === "lead") d.leadsCreated += v;
    else if (s._id.metric === "filed") d.filed += v;
    else if (s._id.metric === "won") d.won += v;
    else if (s._id.metric === "revenue") d.revenue += v;
  }
  return new Map([...out].map(([rc, m]) => [rc, [...m.values()].sort((a, b) => a.day.localeCompare(b.day))]));
}
