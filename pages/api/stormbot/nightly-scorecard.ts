// pages/api/stormbot/nightly-scorecard.ts
// Posts tonight's Storm Bot SCORECARD into Storm Chat. Triggered by the
// nightly-scorecard PM2 cron at 22:00 Central; safe to call by hand (an admin
// session). A call before 22:00 Central returns "too-early" and posts nothing;
// a second call for the same date is a no-op.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { runNightlyScorecard } from "../../../src/lib/stormbot/nightly-scorecard";
import { requireRole } from "../../../src/lib/auth";

function hasSyncSecret(req: NextApiRequest): boolean {
  const secret = req.headers["x-sync-secret"];
  return !!secret && secret === process.env.ACCULYNX_SYNC_SECRET;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!hasSyncSecret(req) && !requireRole(req, res, "admin")) return;
  try {
    await connectMongo();
  } catch {
    return res.status(200).json({ status: "error", error: "db connect failed" });
  }

  // `now` override for verification; rejected unless it parses.
  const nowRaw = typeof req.body?.now === "string" ? req.body.now : "";
  if (nowRaw && Number.isNaN(Date.parse(nowRaw))) {
    return res.status(400).json({ error: "unparseable `now`" });
  }
  const result = await runNightlyScorecard(nowRaw ? new Date(nowRaw) : new Date());
  return res.status(200).json(result);
}
