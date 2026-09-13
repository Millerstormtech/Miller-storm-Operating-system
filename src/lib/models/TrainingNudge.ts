import { Schema, model, models } from "mongoose";

// One row per nudge sent to a rep about an unfinished course (2026-09-13).
//
// Both the send guard and the history the next decision reads: a rep is nudged
// at most once a week, and never more than three times about the same course
// without doing anything in between. Unique on rep + Central calendar day, so a
// cron restart or a second trigger on the same day collides here instead of
// sending twice. Dry runs write nothing.
const trainingNudgeSchema = new Schema(
  {
    userId: { type: String, required: true },
    /** Central-time calendar day it was sent, "2026-09-13". */
    day: { type: String, required: true },
    courseId: { type: String, required: true },
    /** "almost-done" | "stalled" */
    reason: { type: String, required: true },
    /** Lessons and quizzes still to do when it was sent. */
    left: { type: Number, default: 0 },
    /** The lesson or quiz the nudge opens. */
    pageId: { type: String, default: "" },
    notificationId: { type: String, default: "" },
    /** Whether a phone push went out (false when the rep has no device token). */
    pushed: { type: Boolean, default: false },
    sentAt: { type: Date, required: true },
  },
  { timestamps: true }
);

trainingNudgeSchema.index({ userId: 1, day: 1 }, { unique: true });
trainingNudgeSchema.index({ userId: 1, sentAt: -1 });

export const TrainingNudgeModel = models.TrainingNudge || model("TrainingNudge", trainingNudgeSchema);
