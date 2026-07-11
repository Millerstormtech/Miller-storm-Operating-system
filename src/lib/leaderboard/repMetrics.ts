// src/lib/leaderboard/repMetrics.ts
// Data source shared by the sales leaderboard and the role dashboards.
//   getMergedReps(window)  -> one merged row per RepCard rep (RepCard spine + AccuLynx deals)
//   getRepMetrics(window)  -> those rows re-keyed by matched Miller Storm app-user id (for rollups)
// The aggregation pipelines here are the SAME ones pages/api/leaderboard.ts uses, so the
// board and the dashboards always compute from identical per-rep numbers.
import { ScoringFactModel } from "../models/ScoringFact";
import { RepCardKnockFactModel } from "../models/RepCardKnockFact";
import { UserModel } from "../models/User";
import { getWindowRange } from "../acculynx/windows";
import type { Window } from "../acculynx/windows";
import { mergeLeaderboard } from "./merge";
import type { MergedRow } from "./merge";
import { normEmail, normName, normPhone } from "./identity";
import { matchRepsToUsers } from "./repMatch";
import type { RepMetric } from "./repMatch";

export type { RepMetric } from "./repMatch";

/** AccuLynx deals + RepCard verified knocks, aggregated per rep for the window, then merged. */
export async function getMergedReps(window: Window): Promise<MergedRow[]> {
  const { start, end } = getWindowRange(window);

  const acxRaw = await ScoringFactModel.aggregate([
    { $match: { occurredAt: { $gte: start, $lte: end }, repExternalId: { $ne: null } } },
    { $sort: { occurredAt: 1, _id: 1 } },
    { $group: {
        _id: "$repExternalId",
        email: { $last: "$repEmail" }, phone: { $last: "$repPhone" },
        name: { $last: "$repNameSnapshot" }, branch: { $last: "$location" },
        filed: { $sum: { $cond: [{ $eq: ["$metric", "filed"] }, "$value", 0] } },
        won: { $sum: { $cond: [{ $eq: ["$metric", "won"] }, "$value", 0] } },
        revenue: { $sum: { $cond: [{ $eq: ["$metric", "revenue"] }, "$value", 0] } },
    } },
  ]);

  const rcRaw = await RepCardKnockFactModel.aggregate([
    { $match: { occurredAt: { $gte: start, $lte: end } } },
    { $sort: { occurredAt: 1, _id: 1 } },
    { $group: {
        _id: "$repcardUserId",
        email: { $last: "$repEmail" }, phone: { $last: "$repPhone" },
        name: { $last: "$repNameSnapshot" }, branch: { $last: "$location" },
        verifiedKnocks: { $sum: "$verifiedKnocks" },
    } },
  ]);

  const acx = acxRaw.map((r: any) => ({
    repExternalId: r._id, email: normEmail(r.email), phone: normPhone(r.phone),
    nameKey: normName(r.name), name: r.name || "Unknown Rep", branch: r.branch || "",
    filed: r.filed, won: r.won, revenue: r.revenue,
  }));
  const rc = rcRaw.map((r: any) => ({
    repcardUserId: r._id, email: normEmail(r.email), phone: normPhone(r.phone),
    nameKey: normName(r.name), name: r.name || "Unknown Rep", branch: r.branch || "",
    verifiedKnocks: r.verifiedKnocks,
  }));

  return mergeLeaderboard(acx, rc);
}

/** Per-rep metrics keyed by matched app-user id (unmatched reps dropped). Feeds the rollup tree. */
export async function getRepMetrics(window: Window): Promise<RepMetric[]> {
  const merged = await getMergedReps(window);
  const appUsers = await UserModel.find({ deleted: { $ne: true } })
    .select("id email name managerId").lean();
  return matchRepsToUsers(
    merged.map((m) => ({
      email: m.email, name: m.name,
      verifiedKnocks: m.verifiedKnocks, filed: m.filed, won: m.won, revenue: m.revenue,
    })),
    appUsers.map((u: any) => ({ id: u.id, email: u.email, name: u.name, managerId: u.managerId })),
  );
}
