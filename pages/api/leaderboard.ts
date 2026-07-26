// pages/api/leaderboard.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { CourseModel } from "../../src/lib/models/Course";
import { UserModel } from "../../src/lib/models/User";
import { UserProgressModel } from "../../src/lib/models/UserProgress";
import { requireUser, allowMethods } from "../../src/lib/auth";
import { getWindowRange, customRange, centralDateStr } from "../../src/lib/acculynx/windows";
import type { Window } from "../../src/lib/acculynx/windows";
import { pickContractKing, kingMonthLabel } from "../../src/lib/leaderboard/contractKing";
import { courseStats, isRankedUser, RANKED_ROLES } from "../../src/lib/training/scoring";
import { computeSalesRows } from "../../src/lib/leaderboard/compute";

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

    // Ranked = PRIMARY role only. The old query also matched `roles[]`, which
    // put branch managers and admins on the board as salespeople: `roles[]`
    // marks leadership who also run a sales team. Leadership does not compete.
    let usersQuery: any = {
      role: { $in: [...RANKED_ROLES] },
      deleted: { $ne: true },
      suspended: { $ne: true },
      testAccount: { $ne: true }
    };

    // If managerId is provided, only get that manager's team
    if (managerId) {
      usersQuery.managerId = managerId;
      usersQuery.role = "sales";
    }

    const users = await UserModel.find(usersQuery)
      .select("id name email role roles headshotUrl")
      .lean();

    // Fetch all progress for these users and this course. Both completedPages
    // and quizResults are needed — courseStats() uses quizResults to gate
    // completion on passed quizzes, not just watched videos.
    const userIds = users.map(u => u.id);
    const progressRecords = await UserProgressModel.find({
      userId: { $in: userIds },
      courseId: courseId
    }).select("userId completedPages quizResults").lean();

    // Create progress map
    const progressMap = new Map();
    progressRecords.forEach(progress => {
      progressMap.set(progress.userId, progress);
    });

    // Scrub non-sales accounts holding a sales role (Jay, dev/test accounts,
    // shared mailboxes). Branch managers/admins are already gone via the query.
    const rankedUsers = users.filter((u) => isRankedUser({ role: u.role, email: u.email }));

    const rows = rankedUsers.map((u) => {
      const stats = courseStats(course as any, progressMap.get(u.id));
      return {
        id: u.id,
        name: u.name || u.email,
        email: u.email,
        role: u.role || "",
        headshotUrl: u.headshotUrl || "",
        // `done`/`total` now count videos + quizzes, matching the course viewer
        // and the web board. Shape is unchanged, so mobile needs no release.
        done: stats.itemsCompleted,
        total: stats.itemsTotal,
        pct: stats.pct
      };
    });
    // Independent of `rows` on purpose: an empty or fully-scrubbed roster
    // (empty team, all reports removed by isRankedUser) must still report the
    // course's real item count, not 0. courseStats() with no progress reduces
    // to the course's own itemsTotal.
    const total = courseStats(course as any, undefined).itemsTotal;

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

  const rows = await computeSalesRows({ start, end });
  const leaderboard = rows.map((r, i) => ({ rank: i + 1, ...r }));

  // Contract King: the CURRENT CALENDAR MONTH's top rep by Contract Amount.
  // Deliberately its own month window rather than the selected period, so a Year
  // to Date view cannot crown the year's best rep under a "July" caption. When
  // the selected period already IS the current month, no second query runs.
  const monthRange = getWindowRange("month");
  const kingSource = isCustom || w !== "month" ? await computeSalesRows(monthRange) : rows;
  const king = pickContractKing(
    kingSource.map((m) => ({
      id: m.id, name: m.name, revenue: m.revenue, won: m.won,
      filed: m.filed, lead: m.leadsCreated, verifiedKnocks: m.verifiedKnocks,
    }))
  );
  const kingRow = king ? kingSource.find((m) => m.id === king.id) : null;
  const contractKing = king
    ? {
        ...king,
        headshotUrl: kingRow?.headshotUrl || "",
        monthLabel: kingMonthLabel(centralDateStr(monthRange.start)),
      }
    : null;

  return res.status(200).json({
    window: isCustom ? "custom" : w,
    range: { from: isCustom ? fromQ : centralDateStr(start), to: isCustom ? toQ : centralDateStr(end) },
    leaderboard,
    contractKing,
  });
}
