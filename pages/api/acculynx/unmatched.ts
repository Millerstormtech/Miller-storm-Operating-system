// pages/api/acculynx/unmatched.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { ScoringFactModel } from "../../../src/lib/models/ScoringFact";
import { requireRole } from "../../../src/lib/auth";

// Authorization mirrors pages/api/acculynx/sync.ts: a server-trusted x-sync-secret
// header (for the cron), or a signed admin session (httpOnly cookie or Bearer
// token) for the in-app admin panel. Identity is proven by the token, not a
// client-supplied id.
function hasSyncSecret(req: NextApiRequest): boolean {
  const secret = req.headers["x-sync-secret"];
  return !!secret && secret === process.env.ACCULYNX_SYNC_SECRET;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end(); }
  // Cron authenticates with the shared secret; everyone else needs an admin session.
  if (!hasSyncSecret(req)) {
    const auth = requireRole(req, res, "admin");
    if (!auth) return;
  }

  await connectMongo();
  const rows = await ScoringFactModel.aggregate([
    { $match: { repUserId: null, repExternalId: { $ne: null } } },
    // Deterministic order so $last picks the newest name snapshot.
    { $sort: { occurredAt: 1, _id: 1 } },
    { $group: { _id: "$repExternalId", name: { $last: "$repNameSnapshot" }, facts: { $sum: 1 } } },
    { $sort: { facts: -1 } },
  ]);
  return res.status(200).json(rows.map((r: any) => ({ repExternalId: r._id, name: r.name, facts: r.facts })));
}
