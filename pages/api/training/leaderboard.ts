// GET /api/training/leaderboard?scope=overall
// The Overall Course Leaderboard: every ranked rep aggregated across every
// published course. Kept separate from /api/leaderboard on purpose: that
// endpoint's ?courseId= branch is consumed by four Flutter screens and its
// shape must not change (spec 2026-07-20 §8.1).
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { loadBoardData } from "../../../src/lib/training/board-data";
import type { OverallResponse } from "../../../src/lib/training/board";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;
  if (req.query.scope !== "overall") {
    return res.status(400).json({ error: "Unsupported scope" });
  }

  await connectMongo();
  const data = await loadBoardData();

  const payload: OverallResponse = {
    totalCourses: data.totalCourses,
    totalItems: data.totalItems,
    courses: data.courses.map((c: any) => ({ id: c.id, title: c.title })),
    rows: data.rows,
  };
  return res.status(200).json(payload);
}
