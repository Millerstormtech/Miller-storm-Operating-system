// pages/api/scoreboard.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";
import { requireUser, allowMethods } from "../../src/lib/auth";
import { getWindowRange, type Window } from "../../src/lib/acculynx/windows";
import { computeSalesRows } from "../../src/lib/leaderboard/compute";
import type { SalesRow, Totals } from "../../src/lib/scoreboard/types";
import { resolveScope } from "../../src/lib/scoreboard/resolve";
import { scopeRows, sumTotals, rankFor } from "../../src/lib/scoreboard/rollup";
import { conversions, trend, rateDir } from "../../src/lib/scoreboard/metrics";
import { previousSlice, periodEndFor, paceFraction } from "../../src/lib/scoreboard/periods";

const toSalesRow = (r: Awaited<ReturnType<typeof computeSalesRows>>[number]): SalesRow => ({
  repUserId: r.repUserId,
  name: r.name,
  team: r.team,
  branch: r.branch,
  revenue: r.revenue,
  knocks: r.verifiedKnocks,
  claims: r.filed,
  contracts: r.won,
  active: r.active,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;
  await connectMongo();

  try {
    const user = await UserModel.findOne({ id: auth.sub }).select("id role name businessPlan").lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    // Marketing/admin do not use the sales roll-up; Phase 3 handles their variant.
    if ((user as any).role === "marketing" || (user as any).role === "admin") {
      return res.status(200).json({ variant: (user as any).role, scoreboard: null });
    }

    const w = (["day", "week", "month", "year"].includes(String(req.query.window)) ? req.query.window : "month") as Window;
    const now = new Date();
    const cur = getWindowRange(w, now);
    const prev = previousSlice(w, cur.start, now);

    const [curRowsRaw, prevRowsRaw] = await Promise.all([
      computeSalesRows(cur),
      computeSalesRows(prev),
    ]);
    const curRows = curRowsRaw.map(toSalesRow);
    const prevRows = prevRowsRaw.map(toSalesRow);

    const scope = resolveScope({ id: (user as any).id, role: (user as any).role, name: (user as any).name });

    const inScope = scopeRows(curRows, scope);
    const inScopePrev = scopeRows(prevRows, scope);
    const totals = sumTotals(inScope);
    const previous = sumTotals(inScopePrev);

    const conv = conversions(totals);
    const convPrev = conversions(previous);

    // Personal strip: the viewer's own row, only when their scope is wider than themselves
    // AND they personally sell (they appear as a row).
    const ownRow = curRows.find((r) => r.repUserId === (user as any).id) || null;
    const personal: Totals | null = scope.level !== "self" && ownRow ? sumTotals([ownRow]) : null;

    const pace = paceFraction(cur.start, periodEndFor(w, cur.start), now);

    const revenueGoal = (user as any).businessPlan?.revenueGoal ?? null;

    return res.status(200).json({
      window: w,
      scope: { level: scope.level, label: "", count: inScope.length },
      totals,
      previous,
      trends: {
        revenue: trend(totals.revenue, previous.revenue),
        knocks: trend(totals.knocks, previous.knocks),
        claims: trend(totals.claims, previous.claims),
      },
      conversions: {
        knockToClaim: { ...conv.knockToClaim, dir: rateDir(conv.knockToClaim.rate, convPrev.knockToClaim.rate, conv.knockToClaim.hidden) },
        claimToContract: { ...conv.claimToContract, dir: rateDir(conv.claimToContract.rate, convPrev.claimToContract.rate, conv.claimToContract.hidden) },
      },
      contracts: totals.contracts,
      rank: rankFor(curRows, scope),
      pace,
      goals: { revenue: revenueGoal, knocks: null, claims: null },
      personal,
    });
  } catch (error) {
    console.error("[scoreboard] Error:", error);
    return res.status(500).json({ error: "Failed to load scoreboard" });
  }
}
