// GET /api/training/rep/[id]
// One rep's course-by-course breakdown for the detail modal (spec 2026-07-23
// §3.3). Uses the exact same aggregation as the board, so the modal can never
// disagree with the card that opened it. Response NEVER includes email/role.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../../src/lib/mongodb";
import { requireUser, allowMethods } from "../../../../src/lib/auth";
import { loadBoardData } from "../../../../src/lib/training/board-data";
import { courseStats } from "../../../../src/lib/training/scoring";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;
  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  await connectMongo();
  const data = await loadBoardData();

  // Ranked reps only: any account not on the board is a 404, never a partial
  // answer (admins, C-Level, scrub-list, deleted and suspended all excluded).
  const row = data.rows.find((r) => r.id === id);
  if (!row) return res.status(404).json({ error: "Not found" });

  const courses = data.courses.map((c: any) => {
    const s = courseStats(c, data.progressByUserCourse.get(`${id}:${c.id}`));
    return {
      id: c.id,
      title: c.title,
      videosTotal: s.videosTotal,
      videosWatched: s.videosWatched,
      quizzesTotal: s.quizzesTotal,
      quizzesPassed: s.quizzesPassed,
      pct: s.pct,
      complete: s.complete,
      started: s.started,
    };
  });

  // Explicit field list on purpose: email and role must never leak here.
  return res.status(200).json({
    id: row.id,
    name: row.name,
    headshotUrl: row.headshotUrl,
    branch: row.branch,
    team: row.team,
    rank: row.rank,
    isPodium: row.isPodium,
    pct: row.pct,
    itemsCompleted: row.itemsCompleted,
    totalItems: data.totalItems,
    coursesCompleted: row.coursesCompleted,
    totalCourses: data.totalCourses,
    rankTitle: row.rankTitle,
    badges: row.badges,
    courses,
  });
}
