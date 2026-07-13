// pages/api/leaderboard.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { CourseModel } from "../../src/lib/models/Course";
import { UserModel } from "../../src/lib/models/User";
import { UserProgressModel } from "../../src/lib/models/UserProgress";
import { requireUser, allowMethods } from "../../src/lib/auth";
import { ScoringFactModel } from "../../src/lib/models/ScoringFact";
import { getWindowRange } from "../../src/lib/acculynx/windows";
import type { Window } from "../../src/lib/acculynx/windows";
import { RepCardKnockFactModel } from "../../src/lib/models/RepCardKnockFact";
import { RepCardUserModel } from "../../src/lib/models/RepCardUser";
import { mergeLeaderboard } from "../../src/lib/leaderboard/merge";
import { normEmail, normName, normPhone } from "../../src/lib/leaderboard/identity";
import { officeToBranch } from "../../src/lib/repcard/branches";
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
  const w = (["day", "week", "month", "year"].includes(String(req.query.window)) ? req.query.window : "month") as Window;
  const { start, end } = getWindowRange(w);

  // AccuLynx deals aggregated per rep for the window.
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

  // RepCard verified knocks aggregated per rep for the window.
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

  // Normalize keys, then merge (RepCard spine, email->phone->name cascade).
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
  const merged = mergeLeaderboard(acx, rc);

  // Light app enrichment (never gating): match a Miller Storm user by email for
  // the profile photo and the "You" highlight.
  const appUsers = await UserModel.find({ deleted: { $ne: true } }).select("id email headshotUrl name managerId").lean();
  const byEmail = new Map<string, any>();
  for (const u of appUsers) {
    const e = (u as any).email; if (e) byEmail.set(String(e).toLowerCase(), u);
  }

  // RepCard user directory -> Branch + Team. Every board row is a RepCard rep
  // (id = `rc:<repcardUserId>`), so this resolves branch/team for everyone: the
  // office folds into one of the 3 real branches, and team is RepCard's own team.
  const rcUsers = await RepCardUserModel.find({}).select("repcardUserId name office team").lean();
  const rcById = new Map<string, any>();
  for (const u of rcUsers) rcById.set(String((u as any).repcardUserId), u);

  merged.sort((a, b) => b.revenue - a.revenue || b.verifiedKnocks - a.verifiedKnocks || b.won - a.won || b.filed - a.filed);

  const leaderboard = merged.map((m, i) => {
    const u = m.email ? byEmail.get(m.email) : null;
    // Resolve Branch + Team from RepCard's own office/team for this rep.
    const rcId = m.id.startsWith("rc:") ? m.id.slice(3) : "";
    const rcu = rcId ? rcById.get(rcId) : null;
    // Team from the official org chart (by name), RepCard's team as fallback.
    const team = resolveTeam(rcu?.name || m.name, rcu?.team) || null;
    // Org chart wins for Branch: follow the team's branch when the team is known;
    // fall back to the RepCard office only for reps with no team.
    const branch = (team && TEAM_BRANCH[team]) || officeToBranch(rcu?.office);
    return {
      rank: i + 1, id: m.id, name: m.name, branch,
      verifiedKnocks: m.verifiedKnocks, filed: m.filed, won: m.won, revenue: m.revenue,
      repUserId: u ? (u as any).id : null, headshotUrl: u ? (u as any).headshotUrl || "" : "",
      // Team = the rep's RepCard team (e.g. "Gunner", "Lubbock Team"). Used by
      // the board's Team filter.
      team,
      // True when this rep leads their team (i.e. is the branch manager). Used
      // by the admin Branch Manager dashboard to list branch managers.
      isTeamLead: isTeamLead(rcu?.name || m.name, team),
      source: m.source,
    };
  });

  return res.status(200).json({ window: w, leaderboard });
}
