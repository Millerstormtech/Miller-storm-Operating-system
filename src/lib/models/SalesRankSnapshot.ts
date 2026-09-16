import { Schema, model, models } from "mongoose";

// One row per rep per week: where they stood on the Sales Leaderboard when that
// week's first board load happened. Powers the up and down arrows, the same way
// LeaderboardSnapshot does for the training board, and written the same way:
// lazily on read, never by a cron, with the unique index refereeing two
// first-loads-of-the-week that race each other.
//
// The standing photographed is always the SAME one: month to date, whole
// company, by Contract Amount. That is the board's default view and the race the
// monthly crown is run on. Storing the month alongside it matters because that
// race restarts at zero on the 1st: an arrow may only compare two weeks of the
// same month, or it would tell a rep they "dropped 12 places" when in truth
// everyone went back to nothing.
const salesRankSnapshotSchema = new Schema(
  {
    weekOf: { type: Date, required: true },   // UTC midnight of that week's Monday
    month: { type: String, required: true },  // "2026-09", the race being ranked
    repId: { type: String, required: true },  // leaderboard row id, e.g. "rc:123"
    rank: { type: Number, required: true },
    revenue: { type: Number, required: true },
  },
  { timestamps: true }
);

salesRankSnapshotSchema.index({ weekOf: 1, repId: 1 }, { unique: true });

export const SalesRankSnapshotModel =
  models.SalesRankSnapshot || model("SalesRankSnapshot", salesRankSnapshotSchema);
