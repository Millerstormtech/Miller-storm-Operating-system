// GET /api/training/leaderboard?scope=overall
// The Overall Course Leaderboard: every ranked rep aggregated across every
// published course. Kept separate from /api/leaderboard on purpose: that
// endpoint's ?courseId= branch is consumed by four Flutter screens and its
// shape must not change (spec 2026-07-20 §8.1).
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { loadBoardData } from "../../../src/lib/training/board-data";
import { LeaderboardSnapshotModel } from "../../../src/lib/models/LeaderboardSnapshot";
import { publishedItems } from "../../../src/lib/training/scoring";
import {
  weekStartMonday,
  computeRankDeltas,
  type OverallResponse,
} from "../../../src/lib/training/board";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;
  if (req.query.scope !== "overall") {
    return res.status(400).json({ error: "Unsupported scope" });
  }

  await connectMongo();
  const data = await loadBoardData();

  // Weekly snapshot: written by the FIRST board load of each week (decided
  // 2026-07-23; deliberately no cron). The unique {weekOf,userId} index makes
  // concurrent first-loads collide harmlessly. Must never fail the request.
  const weekOf = weekStartMonday(new Date());
  try {
    const exists = await LeaderboardSnapshotModel.exists({ weekOf });
    if (!exists && data.started.length > 0) {
      await LeaderboardSnapshotModel.insertMany(
        data.started.map((r) => ({
          weekOf,
          userId: r.id,
          rank: r.rank,
          itemsCompleted: r.itemsCompleted,
          coursesCompleted: r.coursesCompleted,
        })),
        { ordered: false }
      );
    }
  } catch (e) {
    console.error("[training/leaderboard] snapshot write failed:", e);
  }

  // Arrows: compare against the most recent snapshot week BEFORE this one.
  // If a whole week had zero board loads, the gap week simply has no snapshot
  // and we compare against the latest older one (accepted in the spec).
  let prevRanks: Array<{ userId: string; rank: number }> = [];
  try {
    const prevWeek: any = await LeaderboardSnapshotModel.findOne({ weekOf: { $lt: weekOf } })
      .sort({ weekOf: -1 })
      .select("weekOf")
      .lean();
    if (prevWeek) {
      prevRanks = (await LeaderboardSnapshotModel.find({ weekOf: prevWeek.weekOf })
        .select("userId rank")
        .lean()) as any;
    }
  } catch (e) {
    console.error("[training/leaderboard] snapshot read failed:", e);
  }
  const deltas = computeRankDeltas(data.rows, prevRanks);
  for (const r of data.rows) r.rankDelta = deltas.get(r.id) ?? null;

  const payload: OverallResponse = {
    totalCourses: data.totalCourses,
    totalItems: data.totalItems,
    // videos/quizzes counts feed the By Course header card (spec §4.3).
    courses: data.courses.map((c: any) => {
      const items = publishedItems(c);
      return {
        id: c.id,
        title: c.title,
        videos: items.videoIds.length,
        quizzes: items.quizIds.length,
      };
    }),
    rows: data.rows,
  };
  return res.status(200).json(payload);
}
