// pages/api/acculynx/unmatched.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { ScoringFactModel } from "../../../src/lib/models/ScoringFact";

// Authorization mirrors pages/api/acculynx/sync.ts: a server-trusted x-sync-secret
// header, or a userId resolved to an admin (used by the in-app admin panel).
//
// SECURITY LIMITATION (known, platform-wide): the userId path trusts a client-
// supplied id and is therefore spoofable. The whole app authorizes from the client
// (localStorage; no server sessions/JWT) -- see docs/STATE-OF-THE-PLATFORM.md s7,
// the #1 security debt. This route matches the existing pattern; a real fix is a
// platform-wide server-auth pass across ALL routes, not a one-off here. Impact if
// abused: reads the list of unmatched rep names + fact counts (no data beyond rep
// display names). Previously this endpoint had no gate at all -- this adds the same
// admin check its sibling routes use.
async function authorize(req: NextApiRequest): Promise<boolean> {
  const secret = req.headers["x-sync-secret"];
  if (secret && secret === process.env.ACCULYNX_SYNC_SECRET) return true;

  const userId = (req.query.userId as string) || "";
  if (!userId) return false;
  await connectMongo();
  const user = await UserModel.findOne({ id: userId, deleted: { $ne: true } }).lean();
  const role = (user as any)?.role;
  const roles = (user as any)?.roles ?? [];
  return role === "admin" || roles.includes("admin");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end(); }
  if (!(await authorize(req))) return res.status(401).json({ error: "unauthorized" });

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
