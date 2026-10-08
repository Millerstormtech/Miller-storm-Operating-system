import { Schema, model, models } from "mongoose";

// Which DMO reminders have already gone to whom, so the cron (every 5 minutes)
// never sends the same one twice. `key` is the stage and the form it is about,
// e.g. "weekly-open:2026-10-10" (see src/lib/dmo/reminders.ts). Same
// claim-before-send shape as CalendarReminder.ts: insert first, and a
// duplicate-key error on the unique index means "already sent".
const dmoReminderSchema = new Schema(
  {
    userId: { type: String, required: true },
    key: { type: String, required: true },
    pushed: { type: Boolean, default: false },
    sentAt: { type: Date, required: true },
  },
  { timestamps: true }
);

dmoReminderSchema.index({ userId: 1, key: 1 }, { unique: true });

export const DmoReminderModel = models.DmoReminder || model("DmoReminder", dmoReminderSchema, "dmo_reminders");
