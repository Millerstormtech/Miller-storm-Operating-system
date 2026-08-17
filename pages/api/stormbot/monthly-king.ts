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
import { UserModel } from "../../../src/lib/models/User";
import { announceMonthlyKing } from "../../../src/lib/stormbot/monthly-king";

// Authorization mirrors pages/api/repcard/sync.ts:
//   1. x-sync-secret header (the cron) -- server-trusted, not spoofable.
//   2. body userId resolved to an admin (a manual re-trigger from a script).
// See that file's SECURITY LIMITATION note: path 2 trusts a client-supplied
// userId, which is a known platform-wide issue, not one introduced here. The
// blast radius of abuse is bounded by the once-ever ledger row: a second caller
// for an already-announced month gets "already-sent" and posts nothing.
async function authorize(req: NextApiRequest): Promise<boolean> {
  const secret = req.headers["x-sync-secret"];
  if (secret && secret === process.env.ACCULYNX_SYNC_SECRET) return true;
  const userId = (req.body?.userId as string) || "";
  if (!userId) return false;
  await connectMongo();
  const user = await UserModel.findOne({ id: userId, deleted: { $ne: true } }).lean();
  const role = (user as any)?.role;
  const roles = (user as any)?.roles ?? [];
  return role === "admin" || roles.includes("admin");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!(await authorize(req))) return res.status(401).json({ error: "unauthorized" });
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
