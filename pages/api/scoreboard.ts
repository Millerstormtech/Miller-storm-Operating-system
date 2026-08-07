// pages/api/scoreboard.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";
import { SyncStateModel } from "../../src/lib/models/SyncState";
import { requireUser, allowMethods } from "../../src/lib/auth";
import { getWindowRange, type Window } from "../../src/lib/acculynx/windows";
import { computeSalesRows, loadSharedRosterData } from "../../src/lib/leaderboard/compute";
import type { Totals } from "../../src/lib/scoreboard/types";
import { resolveScope } from "../../src/lib/scoreboard/resolve";
import { scopeRows, sumTotals, rankFor } from "../../src/lib/scoreboard/rollup";
import { conversions, trend, rateDir } from "../../src/lib/scoreboard/metrics";
import { scopeLabel, scopeResolved } from "../../src/lib/scoreboard/display";
import { previousSlice, periodEndFor, paceFraction } from "../../src/lib/scoreboard/periods";
import { toSalesRow } from "../../src/lib/scoreboard/rows";
import { scaleTargetToWindow } from "../../src/lib/scoreboard/goals";

// The scoreboard blends two independently-scheduled syncs: AccuLynx (revenue, claims,
// contracts -- one SyncState doc per location, key "acculynx:<companyId>") and RepCard
// (knocks -- one doc, key "repcard"). lastSyncAt on each doc is only ever advanced on a
// SUCCESSFUL run (see src/lib/acculynx/sync.ts and src/lib/repcard/sync.ts, which both
// explicitly skip advancing it on failure), so every value read here already means "the
// last time this source actually finished".
//
// The screen's promise is "these numbers are current as of X". That statement is only
// true up to the OLDEST successful sync among every source feeding it: if one AccuLynx
// location or RepCard itself is behind, the combined totals are only as fresh as the
// stalest contributor. So this takes the MINIMUM across all of them, not the maximum --
// the admin status endpoint (pages/api/acculynx/status.ts) takes the max across AccuLynx
// locations for "is anything still working" monitoring, which is a different question
// than "can a rep trust this number right now".
async function resolveSyncedAt(): Promise<string | null> {
  // Only read docs that a CURRENT sync actually writes: per-location AccuLynx docs
  // (key "acculynx:<companyId>", written by src/lib/acculynx/sync.ts:120) and the
  // single RepCard doc (key "repcard", written by src/lib/repcard/sync.ts:39).
  //
  // Deliberately excluded: the bare key "acculynx" (no colon). src/lib/models/SyncState.ts:4-6
  // documents it as "a legacy single-location key ... may still exist from the earlier
  // era" -- no sync writes it anymore, so it feeds none of the data this endpoint shows.
  // The regex below is anchored on the colon specifically to keep that doc out; nothing
  // ever falls back to it, no matter how few (or zero) real location docs exist, because
  // a bare-key doc's age says nothing about whether TODAY's data is fresh.
  //
  // This whole lookup is wrapped in try/catch because it is purely additive metadata
  // annotating numbers that are computed independently of it. A transient Mongo error
  // here must never fail the request that carries totals/trends/goals/etc -- a freshness
  // NOTE is not allowed to take down the numbers it merely describes. On failure we
  // return null, which is the SAME honest state as "nothing has synced yet": in both
  // cases we genuinely do not know when the data last synced, and the UI already treats
  // null as "omit the note" either way. Never substitute new Date() or a stale constant.
  try {
    const [acculynxLocations, repcard] = await Promise.all([
      SyncStateModel.find({ key: { $regex: /^acculynx:/ } }).select("lastSyncAt").lean(),
      SyncStateModel.findOne({ key: "repcard" }).select("lastSyncAt").lean(),
    ]);

    const times: number[] = [];
    for (const doc of acculynxLocations) {
      if (doc?.lastSyncAt) times.push(new Date(doc.lastSyncAt).getTime());
    }
    if (repcard?.lastSyncAt) times.push(new Date(repcard.lastSyncAt).getTime());

    // Never invent a value: if nothing has ever synced successfully, say so with null
    // rather than guessing or falling back to "now" or to the excluded legacy doc.
    return times.length ? new Date(Math.min(...times)).toISOString() : null;
  } catch (error) {
    // Logged so a persistent problem is diagnosable, not silently invisible -- matches
    // the handler's own [scoreboard] error tag below.
    console.error("[scoreboard] resolveSyncedAt failed:", error);
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;
  await connectMongo();

  try {
    const caller = await UserModel.findOne({ id: auth.sub }).select("id role name businessPlan").lean();
    if (!caller) return res.status(404).json({ error: "User not found" });

    // Admin "View As": an admin may request another user's scoreboard by passing
    // ?userId=. Everyone else can only see their own — the query param is ignored
    // for them — so this can never leak one rep's board to another. When an admin
    // views a rep, the scoreboard is computed for that REP (their role, scope,
    // and numbers), which is exactly what View As should show.
    const requestedId = typeof req.query.userId === "string" ? req.query.userId : "";
    let user: any = caller;
    if (requestedId && requestedId !== (caller as any).id && (caller as any).role === "admin") {
      const target = await UserModel.findOne({ id: requestedId }).select("id role name businessPlan").lean();
      if (target) user = target;
    }

    // Marketing/admin do not use the sales roll-up; Phase 3 handles their variant.
    if ((user as any).role === "marketing" || (user as any).role === "admin") {
      return res.status(200).json({ variant: (user as any).role, scoreboard: null });
    }

    const w = (["day", "week", "month", "year"].includes(String(req.query.window)) ? req.query.window : "month") as Window;
    const now = new Date();
    const cur = getWindowRange(w, now);
    const prev = previousSlice(w, cur.start, now);

    // The current-period and previous-period runs both need the range-independent
    // roster data (all-time AccuLynx identities, all-time knockers, RepCard/AccuLynx/
    // app-user directories). Load it once per request and hand the same object to
    // both calls instead of letting each one re-run those unbounded scans.
    const shared = await loadSharedRosterData();
    const [curRowsRaw, prevRowsRaw, syncedAt] = await Promise.all([
      computeSalesRows(cur, shared),
      computeSalesRows(prev, shared),
      resolveSyncedAt(),
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

    // Goals are the viewer's OWN targets for the scope they own: a rep's personal
    // numbers, a team lead's team, a branch manager's branch. Entered directly,
    // never summed from below (spec S8). null means "not set" so the UI shows its
    // no-goal state rather than a fabricated zero.
    const plan = (user as any).businessPlan || {};
    const goals = {
      revenue: scaleTargetToWindow(plan.monthlyRevenueTarget, w, cur.start),
      knocks: scaleTargetToWindow(plan.monthlyKnockTarget, w, cur.start),
      claims: scaleTargetToWindow(plan.monthlyClaimsTarget, w, cur.start),
    };

    return res.status(200).json({
      window: w,
      syncedAt,
      // label is the honest, non-empty name for the scope headcount line (the UI's
      // "Dallas · 13 people contributed"), never a fabricated placeholder. See
      // scopeLabel() for why "self" is empty and how a null team/branch (a leader
      // whose app-account name never matched the org chart) gets a truthful
      // fallback instead of a stray "null". `resolved` is the explicit signal the
      // UI needs to tell "this branch/team genuinely has zero contributors" apart
      // from "we could not match this account to a branch/team at all" -- inScope
      // is [] in both cases (scopeRows requires a non-null team/branch key), so
      // count alone cannot distinguish them. See scopeResolved().
      scope: { level: scope.level, label: scopeLabel(scope), count: inScope.length, resolved: scopeResolved(scope) },
      totals,
      previous,
      trends: {
        revenue: trend(totals.revenue, previous.revenue),
        knocks: trend(totals.knocks, previous.knocks),
        claims: trend(totals.claims, previous.claims),
      },
      conversions: {
        knockToClaim: {
          ...conv.knockToClaim,
          dir: convPrev.knockToClaim.hidden ? null : rateDir(conv.knockToClaim.rate, convPrev.knockToClaim.rate, conv.knockToClaim.hidden),
        },
        claimToContract: {
          ...conv.claimToContract,
          dir: convPrev.claimToContract.hidden ? null : rateDir(conv.claimToContract.rate, convPrev.claimToContract.rate, conv.claimToContract.hidden),
        },
      },
      contracts: totals.contracts,
      rank: rankFor(curRows, scope),
      pace,
      goals,
      personal,
    });
  } catch (error) {
    console.error("[scoreboard] Error:", error);
    return res.status(500).json({ error: "Failed to load scoreboard" });
  }
}
