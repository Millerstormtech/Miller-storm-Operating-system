// GET /api/calendar/connect
//
// Starts the Google OAuth handoff. Reached two ways:
//   - Web: a plain <a href> click from the browser, which already carries the
//     ms_session cookie — requireUser resolves the caller from that directly.
//   - Mobile: the Flutter app has no cookie (it's a Bearer-token client), so it
//     first calls POST /api/calendar/mobile-connect-link (authenticated with
//     its normal Bearer header) to get a short-lived one-time link, then opens
//     THIS route externally with ?t=<that token> instead of a cookie.
//
// Either way, once we know who the caller is, we set a short-lived httpOnly
// state cookie bound to that user id and send them to Google. The callback
// (callback.ts) reads that same cookie to know whose account to attach the
// resulting tokens to, and to prove the callback is part of THIS browser's
// flow (not a forged/replayed one).
import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser, verifyShortLived, signShortLived } from "../../../src/lib/auth";
import { authUrl } from "../../../src/lib/googleCalendar/client";

const STATE_TTL_SECONDS = 600; // 10 minutes — plenty for the Google consent screen

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const tParam = typeof req.query.t === "string" ? req.query.t : null;
  let userId: string | null = null;

  if (tParam) {
    userId = verifyShortLived(tParam);
    if (!userId) {
      res.status(401).send("This connect link has expired. Please try connecting again from the app.");
      return;
    }
  } else {
    const auth = requireUser(req, res);
    if (!auth) return; // requireUser already sent a 401
    userId = auth.sub;
  }

  const state = signShortLived(userId, STATE_TTL_SECONDS);
  res.setHeader(
    "Set-Cookie",
    `gcal_state=${state}; HttpOnly; Path=/; Max-Age=${STATE_TTL_SECONDS}; SameSite=Lax; Secure`
  );
  res.writeHead(302, { Location: authUrl(state) });
  res.end();
}
