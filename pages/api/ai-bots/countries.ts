import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { BotChatModel } from "../../../src/lib/models/BotChat";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { ISO_COUNTRIES } from "../../../src/lib/isoCountries";

// "Popular Countries" data for a bot: distinct users per country over the last
// N days, keyed by the ISO numeric id the world-atlas map uses. Country is only
// present on chats made after the CDN geo header started being captured, so old
// history contributes nothing — the map fills in going forward.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  const botId = String(req.query.botId || "");
  if (!botId) return res.status(400).json({ error: "botId is required" });

  const days = Math.min(Math.max(parseInt(String(req.query.days || "28"), 10) || 28, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Distinct users per country (a repeat visitor from the same country counts
  // once), within the window.
  const rows = await BotChatModel.aggregate([
    { $match: { botId, country: { $ne: null }, updatedAt: { $gte: since } } },
    { $group: { _id: "$country", users: { $addToSet: "$userId" } } },
    { $project: { _id: 0, code: "$_id", count: { $size: "$users" } } },
  ]);

  // Keyed by numeric id (for map fill) and by alpha-2 (for a legend/tooltip).
  const counts: Record<string, number> = {};
  const byCode: Record<string, { name: string; count: number }> = {};
  let total = 0;
  for (const r of rows as { code: string; count: number }[]) {
    const meta = ISO_COUNTRIES[r.code];
    if (!meta) continue;
    counts[meta.numeric] = r.count;
    byCode[r.code] = { name: meta.name, count: r.count };
    total += r.count;
  }

  return res.status(200).json({ counts, byCode, total, days });
}
