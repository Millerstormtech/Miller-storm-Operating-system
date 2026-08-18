import { Schema, model, models } from "mongoose";

// One row per month whose Contract King has been announced in Storm Chat.
// The once-ever guard for the monthly announcement, same reasoning as
// SalesCelebration but keyed on the month rather than a deal.
//
// This guard carries more weight than the per-deal one. The cron holds an
// in-memory "already fired today" flag, but that flag dies with the process:
// a PM2 restart, a deploy, or a crash-loop at 09:00 on the 1st would re-fire and
// post the same crowning two, three, five times to the whole company. Only a
// row in the database survives a restart.
//
// The row is inserted BEFORE the message is posted, and the unique index is the
// referee: two processes racing cannot both win, which no "check then write"
// code can promise.
//
// `month` is the Central-time calendar month being ANNOUNCED (the one that just
// ended), as YYYY-MM. Storing the winner alongside it is not used for control
// flow; it is there so the log of who was crowned when survives independently
// of the leaderboard, which is recomputed from live data on every read and will
// happily give a different answer once AccuLynx back-dates a deal.
const monthlyKingAnnouncementSchema = new Schema(
  {
    month: { type: String, required: true, unique: true }, // "2026-08"
    repId: { type: String, required: true },               // leaderboard merge id, e.g. "rc:123"
    repName: { type: String, required: true },
    revenue: { type: Number, required: true },
    sentAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export const MonthlyKingAnnouncementModel =
  models.MonthlyKingAnnouncement || model("MonthlyKingAnnouncement", monthlyKingAnnouncementSchema);
