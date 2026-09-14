import { Schema, model, models } from "mongoose";

// Tracks which (user, Google Calendar event, lead time) reminders have
// already been sent, so a cron tick that runs every few minutes never
// double-sends the same "starts in 1 hour" push twice. Same claim-before-send
// shape as TrainingNudge.ts — insert first, and a duplicate-key error on the
// unique index means "already sent", not a real failure.
const calendarReminderSchema = new Schema(
  {
    userId: { type: String, required: true },
    eventId: { type: String, required: true },
    // "24h" | "1h" | "30m" — see LEAD_TIMES in pages/api/calendar/reminders-cron.ts.
    leadTime: { type: String, required: true },
    eventStart: { type: Date, required: true },
    pushed: { type: Boolean, default: false },
    sentAt: { type: Date, required: true },
  },
  { timestamps: true }
);

calendarReminderSchema.index({ userId: 1, eventId: 1, leadTime: 1 }, { unique: true });

export const CalendarReminderModel = models.CalendarReminder || model("CalendarReminder", calendarReminderSchema);
