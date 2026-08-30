import { Schema, model, models } from "mongoose";

// One document per (userId, date) recording how a rep used the app that day.
// Deliberately coarse — accumulated SECONDS, not a per-event log — so it stays
// tiny and cheap to write from a heartbeat that fires every few seconds.
//
// STRICTLY app/web usage: the client only ever counts time our own page/app is
// open and focused. There is no device-wide tracking of any kind.

// How long the rep spent on each specific training video / quiz that day, split
// by platform — so "which videos did they watch, and how long on web vs the
// app" is answerable per item. Used for both the videos[] and quizzes[] arrays.
const lessonTimeSchema = new Schema(
  { courseId: String, pageId: String, title: String, secondsWeb: { type: Number, default: 0 }, secondsMobile: { type: Number, default: 0 } },
  { _id: false }
);

const dailyActivitySchema = new Schema(
  {
    userId: { type: String, required: true },
    // Calendar day in UTC, "YYYY-MM-DD". One doc per rep per day.
    date: { type: String, required: true },

    // Total time the app was open and focused, split by platform.
    appSecondsWeb: { type: Number, default: 0 },
    appSecondsMobile: { type: Number, default: 0 },

    // Subsets of the app time above: while a training video was on screen, and
    // while a quiz was open. Split by platform so web vs mobile is comparable.
    videoSecondsWeb: { type: Number, default: 0 },
    videoSecondsMobile: { type: Number, default: 0 },
    quizSecondsWeb: { type: Number, default: 0 },
    quizSecondsMobile: { type: Number, default: 0 },

    // Per-video and per-quiz breakdown for the day: which ones, and how long on
    // each, split web vs mobile.
    videos: [lessonTimeSchema],
    quizzes: [lessonTimeSchema],
  },
  { timestamps: true }
);

dailyActivitySchema.index({ userId: 1, date: 1 }, { unique: true });

// In dev, hot-reload keeps the old compiled schema; drop it so field/index
// changes here take effect without restarting (same pattern as the other models).
if (process.env.NODE_ENV !== "production" && (models as any).DailyActivity) {
  delete (models as any).DailyActivity;
}

export const DailyActivityModel =
  models.DailyActivity || model("DailyActivity", dailyActivitySchema);
