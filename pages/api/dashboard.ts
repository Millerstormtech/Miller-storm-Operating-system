// pages/api/dashboard.ts
// Role-scoped scoreboard rollups. Everyone can read the transparent company total;
// this endpoint additionally returns the caller's (or a drilled-into person's)
// self / team / branch / company slices plus a one-level breakdown for drill-down.
//
//   GET /api/dashboard?window=month&as=<userId>
//     -> { window, as, self, team, branch, company, breakdown }
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";
import { requireUser, allowMethods } from "../../src/lib/auth";
import type { Window } from "../../src/lib/acculynx/windows";
import { getRepMetrics } from "../../src/lib/leaderboard/repMetrics";
import { buildTree, subtreeIds, sumMetrics, rollupFor } from "../../src/lib/dashboards/rollup";
import type { Person, Rep, Metrics } from "../../src/lib/dashboards/rollup";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  const w = (["day", "week", "month", "year"].includes(String(req.query.window))
    ? req.query.window : "month") as Window;

  // Everyone (managers included) forms the tree; reps carry the metrics.
  const peopleDocs = await UserModel.find({ deleted: { $ne: true } })
    .select("id name role roles managerId").lean();
  const people: Person[] = peopleDocs.map((u: any) => ({
    id: u.id, name: u.name || "", role: u.role || "", roles: u.roles || [], managerId: u.managerId || "",
  }));
  const reps: Rep[] = await getRepMetrics(w);

  const tree = buildTree(people);
  const byId = new Map(people.map((p) => [p.id, p]));
  const metricById = new Map<string, Rep>(reps.map((r) => [r.id, r]));

  const callerId = auth.sub;
  const callerRole = auth.role;
  const asId = String(req.query.as || callerId);

  // Area authorization: you may view yourself, anyone in your subtree, or — if
  // you're admin / C-level — anyone. The board is transparent; this only guards
  // the management drill-down into a specific person's area.
  const inSubtree = new Set(subtreeIds(callerId, tree));
  const elevated = callerRole === "admin" || callerRole === "c_level";
  if (asId !== callerId && !inSubtree.has(asId) && !elevated) {
    return res.status(403).json({ error: "You can only view your own area." });
  }

  const roll = rollupFor(asId, people, reps);

  // One-level drill breakdown: each direct report's whole-area total, ranked.
  const areaTotal = (rootId: string): Metrics =>
    sumMetrics(subtreeIds(rootId, tree).map((id) => metricById.get(id)).filter(Boolean) as Metrics[]);
  const breakdown = (tree.get(asId) || [])
    .map((cid) => {
      const c = byId.get(cid);
      return { id: cid, name: c?.name || "", role: c?.role || "", metrics: areaTotal(cid) };
    })
    .sort((a, b) => b.metrics.revenue - a.metrics.revenue
      || b.metrics.verifiedKnocks - a.metrics.verifiedKnocks
      || a.name.localeCompare(b.name));

  const me = byId.get(asId);
  return res.status(200).json({
    window: w,
    as: { id: asId, name: me?.name || "", role: me?.role || "" },
    self: roll.self, team: roll.team, branch: roll.branch, company: roll.company,
    breakdown,
  });
}
