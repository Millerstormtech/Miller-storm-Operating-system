import { Schema, model, models } from "mongoose";

// One row per ranked rep per week: their company rank when the week's first
// board load happened (spec 2026-07-23 §5). Powers the ▲▼ arrows. Written
// lazily on read, NOT by a cron; the unique index makes concurrent
// first-loads-of-the-week collide harmlessly.
const leaderboardSnapshotSchema = new Schema(
  {
    weekOf: { type: Date, required: true }, // UTC midnight of that week's Monday
    userId: { type: String, required: true },
    rank: { type: Number, required: true },
    itemsCompleted: { type: Number, required: true },
    coursesCompleted: { type: Number, required: true },
  },
  { timestamps: true }
);

leaderboardSnapshotSchema.index({ weekOf: 1, userId: 1 }, { unique: true });

export const LeaderboardSnapshotModel =
  models.LeaderboardSnapshot || model("LeaderboardSnapshot", leaderboardSnapshotSchema);
