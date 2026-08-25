// pages/api/dashboard.ts
//
// The role dashboard: one board at four zoom levels. Every viewer sees their own
// totals, then a breakdown of the level beneath them (company -> branches ->
// teams -> reps -> months). Designed 2026-08-25 from Jay's sketch.
//
// Deliberately separate from /api/scoreboard rather than more fields on it.
// That endpoint is fetched by four roles on every period toggle and already runs
// two full sales aggregations; this one runs three (year, month, previous month)
// plus the training board, and bolting them together would make every rep wait
// for figures only their manager can see. Same reasoning as
// /api/scoreboard/podiums.
//
// Every ranking rule lives in src/lib/scoreboard/dashboard.ts, imported by the
// screen as well, so the API and the UI can never disagree about who is leading.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";
import { ScoringFactModel } from "../../src/lib/models/ScoringFact";
import { RepCardKnockFactModel } from "../../src/lib/models/RepCardKnockFact";
import { CertificateAwardModel } from "../../src/lib/models/CertificateAward";
import { requireUser, allowMethods } from "../../src/lib/auth";
import { getWindowRange } from "../../src/lib/acculynx/windows";
import { computeSalesRows, loadSharedRosterData } from "../../src/lib/leaderboard/compute";
import { resolveScope } from "../../src/lib/scoreboard/resolve";
import { scopeRows, sumTotals, rankFor } from "../../src/lib/scoreboard/rollup";
import { scopeLabel, scopeResolved } from "../../src/lib/scoreboard/display";
import { trend } from "../../src/lib/scoreboard/metrics";
import { previousSlice } from "../../src/lib/scoreboard/periods";
import { toSalesRow } from "../../src/lib/scoreboard/rows";
import { normEmail } from "../../src/lib/leaderboard/identity";
import { loadBoardData } from "../../src/lib/training/board-data";
import {
  METRICS,
  topN,
  groupBreakdown,
  repLines,
  breakdownFor,
  monthKeys,
  personalBest,
  type Metric,
  type MonthLine,
} from "../../src/lib/scoreboard/dashboard";

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function labelForKey(key: string): string {
  const month = Number(key.slice(5, 7));
  return MONTH_LABELS[month - 1] || key;
}

/**
 * A rep's own month-by-month history for the current year.
 *
 * Aggregated straight out of the two fact collections rather than by running
 * computeSalesRows() once per month: that helper does unbounded roster scans, so
 * six calls to it would make one rep's dashboard the most expensive page in the
 * app. Both collections are dated and indexed on occurredAt, so this is two
 * grouped queries.
 *
 * The join differs per source and that is not an oversight: ScoringFact carries
 * repUserId directly, while RepCardKnockFact has no user id at all and joins on
 * the normalized email, exactly as the leaderboard does (see identity.ts). A rep
 * whose RepCard account uses a different address therefore shows sales history
 * with no knocks, which is the same gap the leaderboard already reports, not a
 * new one introduced here.
 */
async function loadMonthHistory(
  userId: string,
  email: string,
  now: Date
): Promise<MonthLine[]> {
  const keys = monthKeys(now, 6);
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const byKey = new Map<string, MonthLine>(
    keys.map((k) => [k, { key: k, label: labelForKey(k), revenue: 0, contracts: 0, claims: 0, knocks: 0 }])
  );

  const monthExpr = { $dateToString: { format: "%Y-%m", date: "$occurredAt", timezone: "UTC" } };

  const [sales, knocks] = await Promise.all([
    ScoringFactModel.aggregate([
      { $match: { repUserId: userId, occurredAt: { $gte: yearStart } } },
      { $group: { _id: { month: monthExpr, metric: "$metric" }, total: { $sum: "$value" } } },
    ]),
    email
      ? RepCardKnockFactModel.aggregate([
          { $match: { repEmail: email, occurredAt: { $gte: yearStart } } },
          { $group: { _id: { month: monthExpr }, total: { $sum: "$verifiedKnocks" } } },
        ])
      : Promise.resolve([] as any[]),
  ]);

  for (const doc of sales) {
    const line = byKey.get(doc?._id?.month);
    if (!line) continue;
    const metric = doc?._id?.metric;
    const total = Number(doc?.total) || 0;
    // "filed" and "won" are the leaderboard's names for claims and contracts;
    // rows.ts owns the same translation for the live board.
    if (metric === "revenue") line.revenue += total;
    else if (metric === "filed") line.claims += total;
    else if (metric === "won") line.contracts += total;
  }
  for (const doc of knocks) {
    const line = byKey.get(doc?._id?.month);
    if (line) line.knocks += Number(doc?.total) || 0;
  }

  return keys.map((k) => byKey.get(k)!);
}

/**
 * Recent company highlights, C-level only.
 *
 * Certifications earned is the ONLY item type today, because it is the only one
 * Jay has defined and the only one with a reliable date behind it. Lesson
 * completions were undated until 2026-08-20, so anything built on "this week in
 * training" can look forward but not back. Adding item types is a matter of
 * pushing more entries into this list once someone says what qualifies.
 */
async function loadNews(now: Date): Promise<Array<{ text: string; at: string }>> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const awards = await CertificateAwardModel.find({ sentAt: { $gte: since } })
    .select("userId credentialLabel sentAt")
    .sort({ sentAt: -1 })
    .limit(20)
    .lean();
  if (awards.length === 0) return [];

  const users = await UserModel.find({ id: { $in: awards.map((a: any) => a.userId) } })
    .select("id name email")
    .lean();
  const nameById = new Map(users.map((u: any) => [u.id, u.name || u.email || "A rep"]));

  return awards.slice(0, 6).map((a: any) => ({
    text: `${nameById.get(a.userId) || "A rep"} earned the ${a.credentialLabel || "Miller Storm Certification"}`,
    at: new Date(a.sentAt).toISOString(),
  }));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;
  await connectMongo();

  try {
    const caller = await UserModel.findOne({ id: auth.sub }).select("id role name email").lean();
    if (!caller) return res.status(404).json({ error: "User not found" });

    // Admin "View As", matching /api/scoreboard exactly: only an admin may pass
    // ?userId=, and the board is then computed for THAT user's role and scope.
    // Everyone else's query param is ignored, so this cannot leak one rep's
    // board to another.
    const requestedId = typeof req.query.userId === "string" ? req.query.userId : "";
    let user: any = caller;
    if (requestedId && requestedId !== (caller as any).id && (caller as any).role === "admin") {
      const target = await UserModel.findOne({ id: requestedId }).select("id role name email").lean();
      if (target) user = target;
    }

    // Marketing and admin do not have a sales roll-up of their own; the caller
    // renders their existing screen instead of a board full of zeroes.
    if (user.role === "marketing" || user.role === "admin") {
      return res.status(200).json({ variant: user.role, dashboard: null });
    }

    const now = new Date();
    const year = getWindowRange("year", now);
    const month = getWindowRange("month", now);
    const prevMonth = previousSlice("month", month.start, now);

    const shared = await loadSharedRosterData();
    const [yearRaw, monthRaw, prevRaw, board] = await Promise.all([
      computeSalesRows(year, shared),
      computeSalesRows(month, shared),
      computeSalesRows(prevMonth, shared),
      loadBoardData(),
    ]);

    const scope = resolveScope({ id: user.id, role: user.role, name: user.name });
    const yearRows = scopeRows(yearRaw.map(toSalesRow), scope);
    const monthRows = scopeRows(monthRaw.map(toSalesRow), scope);
    const prevRows = scopeRows(prevRaw.map(toSalesRow), scope);

    const yearTotals = sumTotals(yearRows);
    const monthTotals = sumTotals(monthRows);
    const prevTotals = sumTotals(prevRows);

    // Four cards: this month's number, the honest trend against last month, and
    // the top three inside the viewer's own scope.
    const cards: Record<string, unknown> = {};
    for (const m of METRICS) {
      cards[m] = {
        value: monthTotals[m],
        previous: prevTotals[m],
        trend: trend(monthTotals[m], prevTotals[m]),
        top: topN(monthRows, m as Metric, 3),
      };
    }
    // Shown under the contracts card. Guarded because a month with no contracts
    // would otherwise divide by zero and print Infinity next to real money.
    const averageContract =
      monthTotals.contracts > 0 ? Math.round(monthTotals.revenue / monthTotals.contracts) : null;

    // The breakdown row: one level below whoever is looking.
    const kind = breakdownFor(scope.level);
    const breakdown: Record<string, unknown> = { kind };
    if (kind === "branch" || kind === "team") {
      const groupsMonth = groupBreakdown(monthRows, kind);
      const yearByKey = new Map(
        groupBreakdown(yearRows, kind).map((g) => [g.key, g.totals])
      );
      // Each card carries both windows, because a branch manager judging a team
      // needs the year for weight and the month for momentum.
      breakdown.groups = groupsMonth.map((g) => ({
        ...g,
        yearTotals: yearByKey.get(g.key) ?? { revenue: 0, knocks: 0, claims: 0, contracts: 0 },
      }));
    } else if (kind === "rep") {
      breakdown.reps = repLines(monthRows);
    } else {
      const months = await loadMonthHistory(user.id, normEmail(user.email), now);
      const currentKey = monthKeys(now, 1)[0];
      const best: Record<string, unknown> = {};
      for (const m of METRICS) best[m] = personalBest(months, m as Metric, currentKey);
      breakdown.months = months;
      breakdown.best = best;
    }

    // Training Center, scoped the same way as the sales figures above so the two
    // halves of the board describe the same group of people.
    const trainingRows = board.rows.filter((r) => {
      if (scope.level === "company") return true;
      if (scope.level === "branch") return !!scope.branch && r.branch === scope.branch;
      if (scope.level === "team") return !!scope.team && r.team === scope.team;
      return r.id === user.id;
    });
    const trainingPct =
      trainingRows.length > 0
        ? Math.round(trainingRows.reduce((n, r) => n + r.pct, 0) / trainingRows.length)
        : 0;
    const training = {
      pct: trainingPct,
      headcount: trainingRows.length,
      top: [...trainingRows]
        .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name))
        .slice(0, 3)
        .map((r) => ({ id: r.id, name: r.name, pct: r.pct })),
      // A rep sees their three credential bars instead of a podium of colleagues.
      credentials: scope.level === "self" ? trainingRows[0]?.credentials ?? [] : null,
    };

    return res.status(200).json({
      scope: {
        level: scope.level,
        label: scopeLabel(scope),
        resolved: scopeResolved(scope),
        count: monthRows.length,
        viewer: user.name || user.email || "",
      },
      hero: { revenue: yearTotals.revenue, contracts: yearTotals.contracts, year: now.getUTCFullYear() },
      cards,
      averageContract,
      // Company-wide rank is meaningless for the company itself, so rankFor()
      // returns null there and the strip renders nothing.
      rank: rankFor(monthRaw.map(toSalesRow), scope),
      breakdown,
      training,
      news: scope.level === "company" ? await loadNews(now) : null,
    });
  } catch (error) {
    console.error("[dashboard] Error:", error);
    return res.status(500).json({ error: "Failed to load dashboard" });
  }
}
