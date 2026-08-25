// src/lib/leaderboard/compute.ts
import { connectMongo } from "../mongodb";
import { ScoringFactModel } from "../models/ScoringFact";
import { RepCardKnockFactModel } from "../models/RepCardKnockFact";
import { RepCardUserModel } from "../models/RepCardUser";
import { AcculynxUserModel } from "../models/AcculynxUser";
import { UserModel } from "../models/User";
import { mergeLeaderboard } from "./merge";
import { compareStanding } from "./ranking";
import { normEmail, normName, normPhone, hasAcculynxAccount } from "./identity";
import { isDeletedFromRepCard } from "./roster";
import { officeToBranch, attributeToBranch } from "../repcard/branches";
import { resolveTeam, TEAM_BRANCH, isTeamLead, resolveNameBranch, isBranchless } from "../repcard/org-chart";

export interface SalesLeaderRow {
  id: string;               // merge id, e.g. "rc:<repcardUserId>"
  name: string;
  branch: string;
  team: string | null;
  verifiedKnocks: number;
  leadsCreated: number;
  filed: number;
  won: number;
  revenue: number;
  repUserId: string | null;
  headshotUrl: string;
  isTeamLead: boolean;
  source: "both" | "repcard";
  // Former = deactivated in RepCard. Kept as `former` (not the inverse `active`)
  // because the web board and the four Flutter rankings screens already read
  // `former` off this endpoint. Unknown/blank status counts as CURRENT, so a rep
  // is never hidden on a missing field.
  former: boolean;
  // Team-based reporting: a rep's numbers count toward the branch their TEAM
  // belongs to, not the branch each job was filed in. So this holds exactly one
  // entry -- the rep's home branch, carrying their FULL totals -- or none at all
  // when no branch resolves. The branch filter is therefore a roster filter.
  // The rule and its history live in repcard/branches.ts (attributeToBranch).
  byBranch: Record<string, { verifiedKnocks: number; leadsCreated: number; filed: number; won: number; revenue: number }>;
}

// Normalize all-time AccuLynx identities (no date filter, purely a function of the
// raw rows) -> shared exactly as-is between callers, see loadSharedRosterData().
function normalizeAcxAll(acxAllRaw: any[]) {
  return acxAllRaw.map((r: any) => ({
    repExternalId: r._id, email: normEmail(r.email), phone: normPhone(r.phone),
    nameKey: normName(r.name), name: r.name || "Unknown Rep", branch: "",
    lead: 0, filed: 0, won: 0, revenue: 0,
  }));
}

// Everything computeSalesRows needs that does NOT depend on the requested
// {start,end} range: all-time AccuLynx identities, the all-time door-knocker
// roster, the RepCard directory, the AccuLynx account roster, and the app-user
// directory. Callers who need multiple ranges (e.g. current + previous period)
// can load this once and pass it to every computeSalesRows() call instead of
// re-running these unbounded scans per range.
//
// This object is SHARED across every computeSalesRows() call within a single
// request (e.g. current period + previous period both read the same instance
// concurrently via Promise.all). Treat it as immutable: the types below are
// readonly on purpose, so a future normalization step that tries to sort,
// push, or .set() onto any of these fields fails to compile instead of
// silently corrupting the other in-flight range.
export interface SharedRosterData {
  readonly acxAll: ReadonlyArray<ReturnType<typeof normalizeAcxAll>[number]>;
  readonly allTimeKnockers: ReadonlySet<string>;
  readonly rcById: ReadonlyMap<string, any>;
  readonly acctSets: Readonly<{ emails: ReadonlySet<string>; phones: ReadonlySet<string>; names: ReadonlySet<string> }>;
  readonly byEmail: ReadonlyMap<string, any>;
}

export async function loadSharedRosterData(): Promise<SharedRosterData> {
  await connectMongo();

  // All AccuLynx deals per rep ALL-TIME (identity only) -> flags reps who have an
  // AccuLynx account at all, so the "no AccuLynx" dot means a true link gap rather
  // than merely "no sales in this range".
  const acxAllRaw = await ScoringFactModel.aggregate([
    { $match: { repExternalId: { $ne: null } } },
    { $sort: { occurredAt: 1, _id: 1 } },
    { $group: { _id: "$repExternalId", email: { $last: "$repEmail" }, phone: { $last: "$repPhone" }, name: { $last: "$repNameSnapshot" } } },
  ]);
  const acxAll = normalizeAcxAll(acxAllRaw);

  // Reps who have knocked at least once ALL-TIME -> defines the door-knocker roster.
  const knockerRows = await RepCardKnockFactModel.aggregate([
    { $group: { _id: "$repcardUserId", k: { $sum: "$verifiedKnocks" } } },
    { $match: { k: { $gte: 1 } } },
  ]);
  const allTimeKnockers = new Set<string>(knockerRows.map((r: any) => String(r._id)));

  // RepCard directory -> roster identity + Branch/Team. Includes status/email/phone so
  // idle reps (no knock facts in the range) can still be placed with zeros.
  const rcUsers = await RepCardUserModel.find({}).select("repcardUserId name office team status email phone").lean();
  const rcById = new Map<string, any>();
  for (const u of rcUsers) rcById.set(String((u as any).repcardUserId), u);

  // AccuLynx account roster -> normalized identity sets. A rep "has an account" when their
  // email/phone/name matches any AccuLynx login (same cascade as sales). Empty collection
  // (before the first sync) -> all matches false -> source falls back to the sales flag below.
  const acctDocs = await AcculynxUserModel.find({}).select("email nameKey phone").lean();
  const acctSets = { emails: new Set<string>(), phones: new Set<string>(), names: new Set<string>() };
  for (const a of acctDocs as any[]) {
    if (a.email) acctSets.emails.add(a.email);
    if (a.phone) acctSets.phones.add(a.phone);
    if (a.nameKey) acctSets.names.add(a.nameKey);
  }

  // Light app enrichment (never gating): match a Miller Storm user by email for the
  // profile photo and the "You" highlight.
  const appUsers = await UserModel.find({ deleted: { $ne: true }, testAccount: { $ne: true } }).select("id email headshotUrl name managerId").lean();
  const byEmail = new Map<string, any>();
  for (const u of appUsers) {
    const e = (u as any).email; if (e) byEmail.set(String(e).toLowerCase(), u);
  }

  return { acxAll, allTimeKnockers, rcById, acctSets, byEmail };
}

export async function computeSalesRows(
  range: { start: Date; end: Date },
  shared?: SharedRosterData
): Promise<SalesLeaderRow[]> {
  await connectMongo();
  const { start, end } = range;
  const roster = shared ?? (await loadSharedRosterData());

  // AccuLynx deals aggregated per rep for the selected range.
  const acxRaw = await ScoringFactModel.aggregate([
    { $match: { occurredAt: { $gte: start, $lte: end }, repExternalId: { $ne: null } } },
    { $sort: { occurredAt: 1, _id: 1 } },
    { $group: {
        _id: "$repExternalId",
        email: { $last: "$repEmail" }, phone: { $last: "$repPhone" },
        name: { $last: "$repNameSnapshot" }, branch: { $last: "$location" },
        lead: { $sum: { $cond: [{ $eq: ["$metric", "lead"] }, "$value", 0] } },
        filed: { $sum: { $cond: [{ $eq: ["$metric", "filed"] }, "$value", 0] } },
        won: { $sum: { $cond: [{ $eq: ["$metric", "won"] }, "$value", 0] } },
        revenue: { $sum: { $cond: [{ $eq: ["$metric", "revenue"] }, "$value", 0] } },
    } },
  ]);

  // RepCard verified knocks aggregated per rep for the selected range.
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

  const allTimeKnockers = roster.allTimeKnockers;
  const rcById = roster.rcById;

  // Normalize windowed AccuLynx identities for this range.
  const acx = acxRaw.map((r: any) => ({
    repExternalId: r._id, email: normEmail(r.email), phone: normPhone(r.phone),
    nameKey: normName(r.name), name: r.name || "Unknown Rep", branch: r.branch || "",
    lead: r.lead, filed: r.filed, won: r.won, revenue: r.revenue,
  }));
  const acxAll = roster.acxAll;

  // Build the roster: everyone with in-range knocks (active or former), PLUS idle ACTIVE
  // door-knockers as zero rows. Former reps with no in-range activity fall off.
  //
  // Reps DELETED from RepCard are excluded outright. Deleted is not the same as
  // deactivated: a deactivated rep is still a real rep, keeps their row, their totals
  // and their ❌; a deleted rep has been erased from the system of record, so there is
  // no status to mark them with, no office to place them in, and nothing to show. They
  // were previously stranded on the board permanently, unmarkable and unhideable.
  // See roster.ts for the safety valve that stops an unsynced directory emptying the
  // whole board. (The second loop below already excludes them: it requires a directory
  // row with status ACTIVE.)
  const directoryIds = new Set<string>(rcById.keys());
  const rc: any[] = [];
  const rosterIds = new Set<string>();
  for (const r of rcRaw) {
    const id = String(r._id);
    if (isDeletedFromRepCard(id, directoryIds)) continue;
    rosterIds.add(id);
    rc.push({
      repcardUserId: id, email: normEmail(r.email), phone: normPhone(r.phone),
      nameKey: normName(r.name), name: r.name || "Unknown Rep", branch: r.branch || "",
      verifiedKnocks: r.verifiedKnocks,
    });
  }
  for (const id of allTimeKnockers) {
    if (rosterIds.has(id)) continue;
    const u = rcById.get(id);
    if (!u || String((u as any).status) !== "ACTIVE") continue;
    rosterIds.add(id);
    rc.push({
      repcardUserId: id, email: normEmail((u as any).email), phone: normPhone((u as any).phone),
      nameKey: normName((u as any).name), name: (u as any).name || "Unknown Rep", branch: "",
      verifiedKnocks: 0,
    });
  }

  const merged = mergeLeaderboard(acx, rc);
  // All-time link flag: which roster reps match ANY all-time AccuLynx account.
  const linked = new Map<string, boolean>(
    mergeLeaderboard(acxAll, rc).map((r) => [r.id, r.source === "both"] as [string, boolean])
  );

  const acctSets = roster.acctSets;
  // Roster identity by repcardUserId (rc values are already normalized) -> lets us match a
  // merged row (which only carries email) by phone/name too.
  const rcIdentityById = new Map<string, { email: string; phone: string; nameKey: string }>(
    rc.map((r) => [r.repcardUserId, { email: r.email, phone: r.phone, nameKey: r.nameKey }])
  );

  const byEmail = roster.byEmail;

  // Rank order: Contract Amount, then break ties by Contracts -> Claims Filed ->
  // Leads Created -> Verified Door Knocks. Shared with the board component so the
  // server rank and the on-screen order always agree (see ranking.ts).
  merged.sort(compareStanding);

  const leaderboard = merged.map((m, i) => {
    const u = m.email ? byEmail.get(m.email) : null;
    // Resolve Branch + Team from RepCard's own office/team for this rep.
    const rcId = m.id.startsWith("rc:") ? m.id.slice(3) : "";
    const rcu = rcId ? rcById.get(rcId) : null;
    // Does this rep have an AccuLynx account? (roster match by email/phone/name)
    const acctIdent = rcId ? rcIdentityById.get(rcId) : undefined;
    const hasAccount = acctIdent ? hasAcculynxAccount(acctIdent, acctSets) : false;
    // Team from the official org chart (by name), RepCard's team as fallback.
    const team = resolveTeam(rcu?.name || m.name, rcu?.team) || null;
    // Org chart wins for Branch: follow the team's branch when the team is known;
    // fall back to the RepCard office only for reps with no team.
    const branch = (team && TEAM_BRANCH[team]) || resolveNameBranch(rcu?.name || m.name)
      || (isBranchless(rcu?.name || m.name) ? "" : officeToBranch(rcu?.office));
    // Team-based reporting (decided 2026-08-12, confirmed 2026-08-21): every one
    // of this rep's numbers counts toward their home branch -- the branch their
    // TEAM belongs to -- including sales filed out of another branch's AccuLynx
    // sub-account while storm-chasing. The rule itself lives in branches.ts.
    const byBranch = attributeToBranch(branch, {
      verifiedKnocks: m.verifiedKnocks,
      leadsCreated: m.lead,
      filed: m.filed,
      won: m.won,
      revenue: m.revenue,
    });
    return {
      id: m.id, name: m.name, branch,
      verifiedKnocks: m.verifiedKnocks, leadsCreated: m.lead, filed: m.filed, won: m.won, revenue: m.revenue,
      repUserId: u ? (u as any).id : null, headshotUrl: u ? (u as any).headshotUrl || "" : "",
      team,
      isTeamLead: isTeamLead(rcu?.name || m.name, team),
      // "both" = the rep has an AccuLynx ACCOUNT (roster match) OR any all-time sales
      // (backstop — a selling rep can never be flagged). "repcard" = a genuine account gap.
      source: hasAccount || linked.get(m.id) ? "both" : "repcard",
      // Former = deactivated in RepCard. The reliable signal is the RepCard `status`
      // field (ACTIVE vs DEACTIVATE), NOT the marker baked into the synced name.
      // Departed reps keep counting in totals but must not occupy a ranking slot on
      // the Scoreboard. Case-insensitive, and a blank/absent status counts as CURRENT,
      // so an unknown status never silently un-ranks a real rep.
      former: !!(rcu?.status && String(rcu.status).toUpperCase() !== "ACTIVE"),
      // The rep's numbers under their home branch, so a branch filter shows that
      // branch's roster with their full totals. One entry, or none if no branch.
      byBranch,
    };
  });

  return leaderboard as SalesLeaderRow[];
}
