// POST /api/calendar/reminders-cron
// Pushes "your meeting is starting soon" reminders for everyone's connected
// Google Calendar, at three lead times before each event: 24 hours, 1 hour,
// and 30 minutes. Triggered every few minutes by the calendar-reminders PM2
// cron (scripts/calendar-reminders-cron.js) — the endpoint does the work, the
// cron only keeps the clock, like training/nudges.ts.
//
// Idempotency: a lead time only ever fires once per (user, event) — see
// CalendarReminderModel. Calling this endpoint on an overlapping schedule, or
// re-running it by hand, never double-sends.
//
// Only TIMED events get reminders (an all-day event has no clock time to
// count down to in a way "1 hour before" or "30 minutes before" means
// anything for) — a deliberate scope decision, not a gap.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { CalendarReminderModel } from "../../../src/lib/models/CalendarReminder";
import { logToDb } from "../../../src/lib/models/SystemLog";
import { sendPushNotification } from "../../../src/lib/firebase-admin";
import { calendarRouteForRole } from "../../../src/lib/calendarRoute";
import { refreshAccessToken, listUpcomingEvents, type CalendarEvent } from "../../../src/lib/googleCalendar/client";

const EXPIRY_BUFFER_MS = 2 * 60 * 1000;
// Fetch a little past 24h so the 24h lead time has a full window to catch an
// event in, even if a cron tick lands a few minutes late.
const FETCH_WINDOW_MS = 25 * 60 * 60 * 1000;

const LEAD_TIMES: { key: string; minutes: number; label: string }[] = [
  { key: "24h", minutes: 24 * 60, label: "tomorrow" },
  { key: "1h", minutes: 60, label: "in 1 hour" },
  { key: "30m", minutes: 30, label: "in 30 minutes" },
];

function hasSyncSecret(req: NextApiRequest): boolean {
  const secret = req.headers["x-sync-secret"];
  return !!secret && secret === process.env.ACCULYNX_SYNC_SECRET;
}

function fmtClock(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function reminderCopy(ev: CalendarEvent, lead: { key: string; label: string }, start: Date): { title: string; body: string } {
  const when = lead.key === "24h" ? `tomorrow at ${fmtClock(start)}` : `at ${fmtClock(start)}`;
  if (lead.key === "24h") {
    return {
      title: `Tomorrow: ${ev.title}`,
      body: `You have "${ev.title}" ${when} — please be prepared.`,
    };
  }
  return {
    title: `${ev.title} starts ${lead.label}`,
    body: `"${ev.title}" starts ${when}.`,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!hasSyncSecret(req)) return res.status(401).json({ error: "Unauthorized" });

  await connectMongo();

  const now = new Date();
  const windowEnd = new Date(now.getTime() + FETCH_WINDOW_MS);

  const users = await UserModel.find({ "googleCalendar.connected": true })
    .select("id role fcmToken googleCalendar")
    .lean();

  let checked = 0;
  let sent = 0;
  let pushed = 0;
  let failed = 0;

  for (const user of users as any[]) {
    checked++;
    const gcal = user.googleCalendar;
    try {
      let accessToken: string = gcal.accessToken;
      if (!gcal.expiryDate || Date.now() > gcal.expiryDate - EXPIRY_BUFFER_MS) {
        const refreshed = await refreshAccessToken(gcal.refreshToken);
        accessToken = refreshed.access_token;
        await UserModel.updateOne(
          { id: user.id },
          {
            $set: {
              "googleCalendar.accessToken": accessToken,
              "googleCalendar.expiryDate": Date.now() + refreshed.expires_in * 1000,
            },
          }
        );
      }

      const events = await listUpcomingEvents(accessToken, {
        timeMin: now.toISOString(),
        timeMax: windowEnd.toISOString(),
        maxResults: 100,
      });

      for (const ev of events) {
        if (ev.allDay) continue;
        const start = new Date(ev.start);
        const minutesUntilStart = (start.getTime() - now.getTime()) / 60000;
        if (minutesUntilStart <= 0) continue;

        for (const lead of LEAD_TIMES) {
          if (minutesUntilStart > lead.minutes) continue; // threshold not reached yet
          // Claim BEFORE sending: a second cron tick for the same (user, event,
          // leadTime) collides on the unique index here and is skipped, instead
          // of pushing twice.
          try {
            await CalendarReminderModel.create({
              userId: user.id,
              eventId: ev.id,
              leadTime: lead.key,
              eventStart: start,
              sentAt: now,
            });
          } catch (e: any) {
            if (e?.code === 11000) continue; // already sent this lead time for this event
            throw e;
          }

          const { title, body } = reminderCopy(ev, lead, start);
          const notificationId = `notif-calreminder-${user.id}-${ev.id}-${lead.key}`;
          await NotificationModel.create({
            id: notificationId,
            userId: user.id,
            type: "calendar_reminder",
            title,
            message: body,
            read: false,
            metadata: { eventId: ev.id, leadTime: lead.key, watchUrl: calendarRouteForRole(user.role) },
          });
          sent++;

          if (user.fcmToken) {
            const ok = await sendPushNotification(String(user.fcmToken), title, body, {
              type: "calendar_reminder",
              eventId: ev.id,
              leadTime: lead.key,
            });
            if (ok) {
              pushed++;
              await CalendarReminderModel.updateOne(
                { userId: user.id, eventId: ev.id, leadTime: lead.key },
                { $set: { pushed: true } }
              ).catch(() => {});
            }
          }
        }
      }
    } catch (e: any) {
      failed++;
      // A revoked/invalid refresh token surfaces as a 400/401 from Google —
      // same handling as events.ts: disconnect instead of erroring every tick.
      if (e?.message?.includes("Google Calendar 400") || e?.message?.includes("Google Calendar 401")) {
        await UserModel.updateOne({ id: user.id }, { $set: { "googleCalendar.connected": false } }).catch(() => {});
      } else {
        await logToDb("error", "CALENDAR-REMINDERS", `reminder check failed for ${user.id}: ${e?.message}`).catch(() => {});
      }
    }
  }

  return res.status(200).json({ checked, sent, pushed, failed });
}
