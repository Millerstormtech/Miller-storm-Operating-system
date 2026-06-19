// pages/api/acculynx/link-rep.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { ScoringFactModel } from "../../../src/lib/models/ScoringFact";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  const { adminUserId, repExternalId, userId } = req.body ?? {};
  if (!repExternalId || !userId || !adminUserId) return res.status(400).json({ error: "missing fields" });

  await connectMongo();
  // SECURITY LIMITATION (known, platform-wide): adminUserId comes from the request
  // body and is therefore spoofable. The whole app authorizes from the client
  // (localStorage; no server sessions/JWT) -- see docs/STATE-OF-THE-PLATFORM.md s7,
  // the #1 security debt. This route matches the existing pattern; a real fix is a
  // platform-wide server-auth pass across ALL routes, not a one-off here. Impact if
  // abused: an attacker who knows valid ids could mis-link a rep to a user, skewing
  // leaderboard attribution (reversible by re-linking); no data is exfiltrated.
  const admin = await UserModel.findOne({ id: adminUserId, deleted: { $ne: true } }).lean();
  const isAdmin = (admin as any)?.role === "admin" || ((admin as any)?.roles ?? []).includes("admin");
  if (!isAdmin) return res.status(401).json({ error: "unauthorized" });

  const target = await UserModel.findOne({ id: userId, deleted: { $ne: true } });
  if (!target) return res.status(404).json({ error: "user not found" });

  target.acculynxUserId = repExternalId;
  await target.save();

  // Back-fill existing facts so the board reflects the link immediately.
  const upd = await ScoringFactModel.updateMany(
    { repExternalId },
    { $set: { repUserId: target.id, repNameSnapshot: target.name } }
  );

  return res.status(200).json({ ok: true, factsUpdated: upd.modifiedCount });
}
