// POST /api/calendar/mobile-connect-link — mobile-only. The Flutter app calls
// this with its normal Bearer auth to get a one-time link it can open in an
// external browser (Safari/Chrome — Google blocks OAuth in embedded WebViews),
// since that browser has no session cookie of its own. See connect.ts for how
// the resulting ?t= token is consumed.
import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser, allowMethods, signShortLived } from "../../../src/lib/auth";

const LINK_TTL_SECONDS = 300; // 5 minutes — just long enough to switch apps and tap through

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  const token = signShortLived(auth.sub, LINK_TTL_SECONDS);
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || "";
  let origin = "https://millerstorm.tech";
  try {
    origin = new URL(redirectUri).origin;
  } catch {
    // Falls back to the hardcoded origin above if the env var is missing/malformed.
  }

  return res.status(200).json({ url: `${origin}/api/calendar/connect?t=${token}` });
}
