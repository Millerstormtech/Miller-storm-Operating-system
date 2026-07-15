// pages/api/leaderboard.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { CourseModel } from "../../src/lib/models/Course";
import { UserModel } from "../../src/lib/models/User";
import { UserProgressModel } from "../../src/lib/models/UserProgress";
import { requireUser, allowMethods } from "../../src/lib/auth";
import { ScoringFactModel } from "../../src/lib/models/ScoringFact";
import { getWindowRange, customRange, centralDateStr } from "../../src/lib/acculynx/windows";
import type { Window } from "../../src/lib/acculynx/windows";
import { RepCardKnockFactModel } from "../../src/lib/models/RepCardKnockFact";
import { RepCardUserModel } from "../../src/lib/models/RepCardUser";
import { AcculynxUserModel } from "../../src/lib/models/AcculynxUser";
import { mergeLeaderboard } from "../../src/lib/leaderboard/merge";
import { normEmail, normName, normPhone, hasAcculynxAccount } from "../../src/lib/leaderboard/identity";
import { officeToBranch, saleRegion } from "../../src/lib/repcard/branches";
import { resolveTeam, TEAM_BRANCH, isTeamLead } from "../../src/lib/repcard/org-chart";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  const { courseId, managerId } = req.query;

  // If courseId is provided, return course leaderboard
  if (courseId) {
    // Fetch course — strip heavy per-page content (HTML body/transcript/quiz)
    // at the DB level. The leaderboard only needs page metadata (id/status/
    // isQuiz/folderId) to count published lessons, so loading the full course
    // doc for every request made this endpoint slow on mobile.
    const course = await CourseModel.findOne({ id: courseId })
      .select("-pages.body -pages.transcript -pages.quizQuestions -pages.resourceLinks -pages.fileUrls -pages.pinnedCommunityPostUrl -quizQuestions -links")
      .lean();
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Fetch users
    let usersQuery: any = {
      $or: [
        { role: "sales-team-lead" },
        { role: "sales" },
        { roles: { $in: ["sales-team-lead", "sales"] } }
      ],
      deleted: { $ne: true },
      suspended: { $ne: true }
    };

    // If managerId is provided, only get that manager's team
    if (managerId) {
      usersQuery.managerId = managerId;
      usersQuery.role = "sales";
    }

    const users = await UserModel.find(usersQuery)
      .select("id name email role roles headshotUrl")
      .lean();

    // Fetch all progress for these users and this course. Only completedPages is
    // needed to score — skip quizResults/answers so the payload stays small.
    const userIds = users.map(u => u.id);
    const progressRecords = await UserProgressModel.find({
      userId: { $in: userIds },
      courseId: courseId
    }).select("userId completedPages").lean();

    // Create progress map
    const progressMap = new Map();
    progressRecords.forEach(progress => {
      progressMap.set(progress.userId, progress);
    });

    // Filter published lessons
    const publishedFolderIds = new Set(
      (course.folders || [])
        .filter((f: any) => f.status === "published")
        .map((f: any) => f.id)
    );
    const lessonPages = (course.pages || []).filter(
      (p: any) =>
        p.status === "published" &&
        !p.isQuiz &&
        (!p.folderId || publishedFolderIds.has(p.folderId))
    );
    const lessonIds = new Set(lessonPages.map((p: any) => p.id));
    const total = lessonPages.length;

    // Build leaderboard rows
      const rows = users.map(u => {
        const progress = progressMap.get(u.id);
        const done = (progress?.completedPages || []).filter((id: string) => lessonIds.has(id)).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return {
          id: u.id,
          name: u.name || u.email,
          email: u.email,
          role: u.role || (u.roles || [])[0] || "",
          headshotUrl: u.headshotUrl || "",
          done,
          total,
          pct
        };
      });

    // Sort rows
    rows.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));

    return res.status(200).json({
      course: {
        id: course.id,
        title: course.title
      },
      rows,
      total
    });
  }

  // Union sales leaderboard: RepCard Verified Door Knocks (spine) + AccuLynx deals.
  // Range: an explicit from/to (YYYY-MM-DD) picks a custom range; else a quick window.
  const fromQ = typeof req.query.from === "string" ? req.query.from : "";
  const toQ = typeof req.query.to === "string" ? req.query.to : "";
  const isCustom = /^\d{4}-\d{2}-\d{2}$/.test(fromQ) && /^\d{4}-\d{2}-\d{2}$/.test(toQ);
  const w = (["day", "week", "month", "year"].includes(String(req.query.window)) ? req.query.window : "month") as Window;
  const { start, end } = isCustom ? customRange(fromQ, toQ) : getWindowRange(w);

  // AccuLynx deals aggregated per rep for the selected range.
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

  // Per (rep, sub-account) sales for the range -> split a rep's sales by the branch each
  // sale was filed in (build 2). Grouped by location; bucketed into regions via saleRegion.
  const acxLocRaw = await ScoringFactModel.aggregate([
    { $match: { occurredAt: { $gte: start, $lte: end }, repExternalId: { $ne: null } } },
    { $sort: { occurredAt: 1, _id: 1 } },
    { $group: {
        _id: { rep: "$repExternalId", loc: "$location" },
        email: { $last: "$repEmail" }, phone: { $last: "$repPhone" }, name: { $last: "$repNameSnapshot" },
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

  // All AccuLynx deals per rep ALL-TIME (identity only) -> flags reps who have an
  // AccuLynx account at all, so the "no AccuLynx" dot means a true link gap rather
  // than merely "no sales in this range".
  const acxAllRaw = await ScoringFactModel.aggregate([
    { $match: { repExternalId: { $ne: null } } },
    { $sort: { occurredAt: 1, _id: 1 } },
    { $group: { _id: "$repExternalId", email: { $last: "$repEmail" }, phone: { $last: "$repPhone" }, name: { $last: "$repNameSnapshot" } } },
  ]);

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

  // Normalize windowed AccuLynx + all-time AccuLynx identities.
  const acx = acxRaw.map((r: any) => ({
    repExternalId: r._id, email: normEmail(r.email), phone: normPhone(r.phone),
    nameKey: normName(r.name), name: r.name || "Unknown Rep", branch: r.branch || "",
    filed: r.filed, won: r.won, revenue: r.revenue,
  }));
  const acxAll = acxAllRaw.map((r: any) => ({
    repExternalId: r._id, email: normEmail(r.email), phone: normPhone(r.phone),
    nameKey: normName(r.name), name: r.name || "Unknown Rep", branch: "",
    filed: 0, won: 0, revenue: 0,
  }));

  // Build the roster: everyone with in-range knocks (active or former), PLUS idle ACTIVE
  // door-knockers as zero rows. Former reps with no in-range activity fall off.
  const rc: any[] = [];
  const rosterIds = new Set<string>();
  for (const r of rcRaw) {
    const id = String(r._id);
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
  // Roster identity by repcardUserId (rc values are already normalized) -> lets us match a
  // merged row (which only carries email) by phone/name too.
  const rcIdentityById = new Map<string, { email: string; phone: string; nameKey: string }>(
    rc.map((r) => [r.repcardUserId, { email: r.email, phone: r.phone, nameKey: r.nameKey }])
  );

  // Per-branch split: bucket each rep's sales into raw regions (West Texas / Commercial /
  // DFW), then merge each region onto the roster so a branch filter can show that branch's
  // numbers only. Sums across the three regions equal each rep's combined total.
  const regionAcc: Record<string, Map<string, any>> = { "West Texas": new Map(), Commercial: new Map(), DFW: new Map() };
  for (const r of acxLocRaw as any[]) {
    const region = saleRegion(r._id.loc);
    const repId = String(r._id.rep);
    const cur = regionAcc[region].get(repId) || { email: r.email, phone: r.phone, name: r.name, filed: 0, won: 0, revenue: 0 };
    cur.filed += r.filed; cur.won += r.won; cur.revenue += r.revenue;
    regionAcc[region].set(repId, cur);
  }
  const acxForRegion = (region: string) => [...regionAcc[region].entries()].map(([repId, v]: [string, any]) => ({
    repExternalId: repId, email: normEmail(v.email), phone: normPhone(v.phone),
    nameKey: normName(v.name), name: v.name || "Unknown Rep", branch: "",
    filed: v.filed, won: v.won, revenue: v.revenue,
  }));
  const sumsById = (rows: any[]) => new Map<string, any>(rows.map((r) => [r.id, { filed: r.filed, won: r.won, revenue: r.revenue }]));
  const wtById = sumsById(mergeLeaderboard(acxForRegion("West Texas"), rc));
  const dfwById = sumsById(mergeLeaderboard(acxForRegion("DFW"), rc));
  const commById = sumsById(mergeLeaderboard(acxForRegion("Commercial"), rc));

  // Light app enrichment (never gating): match a Miller Storm user by email for the
  // profile photo and the "You" highlight.
  const appUsers = await UserModel.find({ deleted: { $ne: true } }).select("id email headshotUrl name managerId").lean();
  const byEmail = new Map<string, any>();
  for (const u of appUsers) {
    const e = (u as any).email; if (e) byEmail.set(String(e).toLowerCase(), u);
  }

  merged.sort((a, b) => b.revenue - a.revenue || b.verifiedKnocks - a.verifiedKnocks || b.won - a.won || b.filed - a.filed);

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
    const branch = (team && TEAM_BRANCH[team]) || officeToBranch(rcu?.office);
    // Per-branch split: DFW-filed sales -> the rep's home branch; West Texas / Commercial
    // sales -> their own branch. Knocks live only under the home branch.
    const zero = { filed: 0, won: 0, revenue: 0 };
    const byBranch: Record<string, any> = {};
    const addBranch = (br: string, s: any, knocks: number) => {
      if (!br) return;
      const b = byBranch[br] || { verifiedKnocks: 0, filed: 0, won: 0, revenue: 0 };
      b.filed += s.filed; b.won += s.won; b.revenue += s.revenue; b.verifiedKnocks += knocks;
      byBranch[br] = b;
    };
    addBranch(branch, zero, m.verifiedKnocks);            // home branch carries the knocks
    addBranch(branch, dfwById.get(m.id) || zero, 0);      // DFW-filed sales -> home branch
    addBranch("West Texas", wtById.get(m.id) || zero, 0);
    addBranch("Commercial", commById.get(m.id) || zero, 0);
    return {
      rank: i + 1, id: m.id, name: m.name, branch,
      verifiedKnocks: m.verifiedKnocks, filed: m.filed, won: m.won, revenue: m.revenue,
      repUserId: u ? (u as any).id : null, headshotUrl: u ? (u as any).headshotUrl || "" : "",
      team,
      isTeamLead: isTeamLead(rcu?.name || m.name, team),
      // "both" = the rep has an AccuLynx ACCOUNT (roster match) OR any all-time sales
      // (backstop — a selling rep can never be flagged). "repcard" = a genuine account gap.
      source: hasAccount || linked.get(m.id) ? "both" : "repcard",
      // Per-branch breakdown so the UI can show a rep's numbers for a single branch.
      byBranch,
    };
  });

  return res.status(200).json({
    window: isCustom ? "custom" : w,
    range: { from: isCustom ? fromQ : centralDateStr(start), to: isCustom ? toQ : centralDateStr(end) },
    leaderboard,
  });
}
