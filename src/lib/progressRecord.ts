import { UserProgressModel } from "./models/UserProgress";

/**
 * Guarantee a UserProgress record exists for this rep + course before a handler
 * reads it.
 *
 * WHY. Three endpoints write this record: /api/progress (web), /api/progress/save
 * (the Flutter app) and /api/progress/video-position (the watch-position
 * heartbeat). Each used the same read-then-create shape:
 *
 *     const progress = await UserProgressModel.findOne({ userId, courseId });
 *     if (!progress) progress = new UserProgressModel({ ... });
 *     await progress.save();
 *
 * When two writes arrive together for a rep who has no progress in that course
 * yet, BOTH find nothing, BOTH construct a new document, and the second loses
 * the insert race on the unique { userId, courseId } index. The loser threw
 * E11000 and returned a 500, so that write was silently dropped — and if the
 * dropped write was the one recording a finished lesson, the rep watched a
 * video and it never got ticked. Measured at roughly 1 in 16 concurrent
 * first-time writes on 2026-08-29.
 *
 * Calling this first turns the create into an atomic upsert, so by the time a
 * handler reads, the record is always there and its create branch never runs.
 * It deliberately writes ONLY on insert: an existing record is left completely
 * untouched, so this is safe to call on every request.
 */
export async function ensureProgressRecord(userId: string, courseId: string): Promise<void> {
  const now = new Date();
  try {
    // Raw driver, not the Mongoose model: Mongoose stamps `$inc: { __v: 1 }`
    // onto array-touching updates, and that version bump is enough on its own
    // to make a concurrent .save() elsewhere throw VersionError — trading one
    // lost-write bug for another.
    await (UserProgressModel.collection as any).updateOne(
      { userId, courseId },
      {
        $setOnInsert: {
          userId,
          courseId,
          completedPages: [],
          pageCompletions: [],
          unlockedPages: [],
          quizResults: [],
          videoPositions: [],
          courseCompleted: false,
          createdAt: now,
          updatedAt: now,
          __v: 0,
        },
      },
      { upsert: true }
    );
  } catch (err: any) {
    // Two upserts landing together can still collide on the unique index.
    // A duplicate key here means the record now exists, which is the only
    // thing this function set out to achieve — so it is success, not failure.
    if (err?.code !== 11000) throw err;
  }
}
