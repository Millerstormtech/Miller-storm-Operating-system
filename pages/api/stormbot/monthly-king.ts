// pages/api/stormbot/monthly-king.ts
// Posts the previous month's Contract King into Storm Chat. Triggered by the
// monthly-king PM2 cron on the 1st at 09:00 Central; safe to call by hand.
//
// The endpoint does the work; the cron is only a clock. That mirrors the other
// three crons in this repo, which are HTTP clients rather than workers, and it
// means the announcement runs inside the Next app with its database connection,
// its models and its env already loaded.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { announceMonthlyKing } from "../../../src/lib/stormbot/monthly-king";
import { requireRole } from "../../../src/lib/auth";

// Two paths, like pages/api/acculynx/sync.ts:
//   1. x-sync-secret header (the cron) -- server-trusted, not spoofable.
//   2. a signed admin session (cookie or Bearer token), for a manual run from
//      the app. Identity comes from the token, never from a userId in the body:
//      a typed-in userId used to be enough, so anyone who knew an admin's
//      email could trigger this (fixed 2026-10-03).
function hasSyncSecret(req: NextApiRequest): boolean {
  const secret = req.headers["x-sync-secret"];
  return !!secret && secret === process.env.ACCULYNX_SYNC_SECRET;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!hasSyncSecret(req) && !requireRole(req, res, "admin")) return;
  await connectMongo();

  // `now` override, for verifying a specific month without waiting for the 1st.
  // Rejected unless it parses, so a typo cannot silently announce the wrong
  // month: an unparseable date would fall back to "now" and crown last month.
  const nowRaw = typeof req.body?.now === "string" ? req.body.now : "";
  if (nowRaw && Number.isNaN(Date.parse(nowRaw))) {
    return res.status(400).json({ error: "unparseable `now`" });
  }
  const now = nowRaw ? new Date(nowRaw) : new Date();

  const result = await announceMonthlyKing(now);
  return res.status(200).json(result);
}
