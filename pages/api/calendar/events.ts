// GET /api/calendar/events — this person's own upcoming events, next ~30 days.
// Called by both web (My Calendar page) and the phone app (calendar_screen.dart)
// with their normal auth (cookie or Bearer — requireUser accepts either
// already, so no mobile-specific handling is needed here, unlike connect.ts).
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { refreshAccessToken, listUpcomingEvents } from "../../../src/lib/googleCalendar/client";

// Refresh a little before actual expiry so a request never races a token that
// expires mid-flight.
const EXPIRY_BUFFER_MS = 2 * 60 * 1000;
const WINDOW_DAYS = 30;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  try {
    await connectMongo();
    const user = await UserModel.findOne({ id: auth.sub }).select("googleCalendar").lean();
    const gcal = (user as any)?.googleCalendar;
    if (!gcal?.connected) {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ connected: false, events: [] });
    }

    let accessToken: string = gcal.accessToken;
    if (!gcal.expiryDate || Date.now() > gcal.expiryDate - EXPIRY_BUFFER_MS) {
      const refreshed = await refreshAccessToken(gcal.refreshToken);
      accessToken = refreshed.access_token;
      await UserModel.updateOne(
        { id: auth.sub },
        {
          $set: {
            "googleCalendar.accessToken": accessToken,
            "googleCalendar.expiryDate": Date.now() + refreshed.expires_in * 1000,
          },
        }
      );
    }

    const now = new Date();
    const until = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const events = await listUpcomingEvents(accessToken, {
      timeMin: now.toISOString(),
      timeMax: until.toISOString(),
    });

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ connected: true, events });
  } catch (e: any) {
    console.error("[calendar/events] failed:", e?.message);
    // A revoked/invalid refresh token surfaces as a 400 from Google — treat it
    // as "not connected" so the UI offers Connect again instead of a dead error.
    if (e?.message?.includes("Google Calendar 400") || e?.message?.includes("Google Calendar 401")) {
      await connectMongo();
      await UserModel.updateOne({ id: auth.sub }, { $set: { "googleCalendar.connected": false } });
      return res.status(200).json({ connected: false, events: [] });
    }
    return res.status(500).json({ error: "Could not load calendar events" });
  }
}
