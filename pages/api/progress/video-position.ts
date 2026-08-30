import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { ensureProgressRecord } from "../../../src/lib/progressRecord";

// Records how far into a training video the rep has watched, so the lesson can
// be resumed (and scrubbed up to that point) after any interruption. Called
// every few seconds while a video plays, which is why it is deliberately its
// own tiny endpoint rather than a branch of /api/progress: that handler loads
// the course, re-grades quizzes and fans out celebration notifications, none of
// which a heartbeat should pay for.
//
// SELF ONLY. Unlike /api/progress there is no admin-on-behalf-of path: a
// watched position is evidence of what THIS rep personally watched, and there
// is no tool that would ever need to write someone else's. The body carries no
// userId at all; the trusted id is auth.sub.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (!allowMethods(req, res, ["POST"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  const { courseId, pageId, videoIndex, seconds } = req.body || {};

  if (!courseId || typeof courseId !== "string") {
    res.status(400).json({ error: "courseId is required" });
    return;
  }
  if (!pageId || typeof pageId !== "string") {
    res.status(400).json({ error: "pageId is required" });
    return;
  }

  // Reject a position we cannot use. This is the ONLY guard on what reaches the
  // database from here (the write below is a raw atomic operator, not a pass
  // through mergeVideoPosition), and answering 200 to input we discarded would
  // tell a caller its write landed when it did not, hiding a client bug behind
  // a green response.
  const secondsNum = Number(seconds);
  if (!Number.isFinite(secondsNum) || secondsNum < 0) {
    res.status(400).json({ error: "seconds must be a non-negative number" });
    return;
  }
  // An omitted videoIndex means the lesson's only video.
  const indexNum = Number(videoIndex) || 0;
  if (!Number.isInteger(indexNum) || indexNum < 0) {
    res.status(400).json({ error: "videoIndex must be a non-negative whole number" });
    return;
  }

  try {
    await connectMongo();

    // ── Written with ATOMIC operators, never load-mutate-.save() ──────────────
    //
    // This is a heartbeat: it fires every few seconds per rep, against the SAME
    // UserProgress document that /api/progress writes when a lesson completes.
    // Mongoose's .save() carries optimistic concurrency on array paths, so two
    // writers touching the doc together make the loser throw a VersionError —
    // a 500, and a LOST WRITE. Caught in the smoke test on 2026-08-29: the
    // heartbeat and the completion save collided near the end of a video and
    // the completion was dropped, which is precisely the "website did not mark
    // my video watched" complaint this work exists to fix.
    //
    // Each statement below is a single-document atomic update. None of them
    // touches __v, so this endpoint can no longer collide with (or provoke a
    // conflict in) the completion write.

    // Written through the raw driver, NOT the Mongoose model. Mongoose adds
    // `$inc: { __v: 1 }` to any array-modifying update, and that version bump
    // is itself enough to make a concurrent completion .save() throw
    // VersionError — the heartbeat would still be knocking completions over
    // even though it no longer uses .save() itself. The driver does exactly
    // what is written here and nothing more. Values are already validated
    // above, so nothing is lost by skipping Mongoose's casting.
    // `any` because the driver's PushOperator typing is written against a
    // generic Document and cannot see this schema's array shape.
    const col: any = UserProgressModel.collection;

    // 1. Make sure the record exists, without disturbing anything already in it.
    //    Shared with the two completion endpoints so the three writers cannot
    //    drift on what an empty progress record looks like.
    await ensureProgressRecord(auth.sub, courseId);

    // 2. Move an existing point FORWARD only. $max is the same "never goes
    //    backward" rule that mergeVideoPosition enforces for every other
    //    reader/writer (src/lib/training/video-position.ts) — expressed as a
    //    database operator so it holds under concurrent writes too.
    const moved = await col.updateOne(
      {
        userId: auth.sub,
        courseId,
        videoPositions: { $elemMatch: { pageId, videoIndex: indexNum } },
      },
      { $max: { "videoPositions.$.seconds": secondsNum } }
    );

    // 3. First time this video has been watched: append it. The $not guard
    //    means two heartbeats racing here cannot append the same video twice.
    if (moved.matchedCount === 0) {
      await col.updateOne(
        {
          userId: auth.sub,
          courseId,
          videoPositions: { $not: { $elemMatch: { pageId, videoIndex: indexNum } } },
        },
        { $push: { videoPositions: { pageId, videoIndex: indexNum, seconds: secondsNum } } }
      );
    }

    res.status(200).json({ success: true });
    return;
  } catch (error) {
    console.error("❌ Error saving video position:", error);
    res.status(500).json({ error: "Failed to save video position" });
    return;
  }
}
