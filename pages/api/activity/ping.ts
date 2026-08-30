import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { DailyActivityModel } from "../../../src/lib/models/DailyActivity";
import { requireUser, allowMethods } from "../../../src/lib/auth";

// Heartbeat from the web page / mobile app: "the rep spent N more seconds using
// the app since the last ping." Accumulates into today's per-rep row. SELF ONLY
// — the trusted id is auth.sub; the body carries no userId.
//
// Written with atomic $inc through the raw driver (never load-mutate-.save()) so
// rapid heartbeats from two tabs / the app + a browser cannot collide or lose a
// write — the same lesson learned in /api/progress/video-position.

function todayUtc(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Clamp a reported delta to something sane: non-negative, and never more than a
// few minutes per ping (a client that was backgrounded should send small deltas;
// a huge value is a bug or a clock jump, not real watch time).
function clampSeconds(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n), 600);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (!allowMethods(req, res, ["POST"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;
  const userId = auth.sub;

  const body = req.body || {};
  const platform = body.platform === "mobile" ? "mobile" : "web";
  const appSeconds = clampSeconds(body.appSeconds);
  const video = body.video && typeof body.video === "object" ? body.video : null;
  const quiz = body.quiz && typeof body.quiz === "object" ? body.quiz : null;
  const videoSecs = video ? clampSeconds(video.seconds) : 0;
  const quizSecs = quiz ? clampSeconds(quiz.seconds) : 0;

  // Nothing to record — don't touch the DB.
  if (appSeconds === 0 && videoSecs === 0 && quizSecs === 0) {
    res.status(200).json({ success: true, noop: true });
    return;
  }

  const date = todayUtc();
  const suffix = platform === "mobile" ? "Mobile" : "Web";

  try {
    await connectMongo();
    const col: any = DailyActivityModel.collection;

    // Aggregate per-platform counters. video/quiz seconds are subsets of app time.
    const inc: Record<string, number> = {};
    if (appSeconds) inc[`appSeconds${suffix}`] = appSeconds;
    if (videoSecs) inc[`videoSeconds${suffix}`] = videoSecs;
    if (quizSecs) inc[`quizSeconds${suffix}`] = quizSecs;

    // 1. Upsert today's row and apply the aggregate platform counters atomically.
    await col.updateOne(
      { userId, date },
      { $inc: inc, $setOnInsert: { userId, date, videos: [], quizzes: [] } },
      { upsert: true }
    );

    // 2. Per-item breakdown, split by platform. Same forward-only atomic pattern
    //    as the aggregates: $inc an existing entry's platform field, else push a
    //    new one (the $not guard stops two heartbeats appending the same page).
    async function addLessonTime(field: "videos" | "quizzes", item: any, secs: number) {
      if (!item || !item.pageId || secs <= 0) return;
      const pageId = String(item.pageId);
      const courseId = String(item.courseId ?? "");
      const title = String(item.title ?? "");
      const moved = await col.updateOne(
        { userId, date, [field]: { $elemMatch: { pageId } } },
        { $inc: { [`${field}.$.seconds${suffix}`]: secs }, $set: { [`${field}.$.title`]: title, [`${field}.$.courseId`]: courseId } }
      );
      if (moved.matchedCount === 0) {
        const entry: any = { courseId, pageId, title, secondsWeb: 0, secondsMobile: 0 };
        entry[`seconds${suffix}`] = secs;
        await col.updateOne(
          { userId, date, [field]: { $not: { $elemMatch: { pageId } } } },
          { $push: { [field]: entry } }
        );
      }
    }

    await addLessonTime("videos", video, videoSecs);
    await addLessonTime("quizzes", quiz, quizSecs);

    res.status(200).json({ success: true });
    return;
  } catch (error: any) {
    console.error("❌ Error recording activity ping:", error?.message || error);
    res.status(500).json({ error: "Failed to record activity" });
    return;
  }
}
