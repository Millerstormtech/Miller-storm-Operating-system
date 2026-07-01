// pages/api/acculynx/link-rep.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { ScoringFactModel } from "../../../src/lib/models/ScoringFact";
import { requireRole } from "../../../src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  // Auth: caller identity is proven by their signed session (httpOnly cookie or
  // Bearer token), not by a spoofable body field. Must be an admin.
  const auth = requireRole(req, res, "admin");
  if (!auth) return;

  const { repExternalId, userId } = req.body ?? {};
  if (!repExternalId || !userId) return res.status(400).json({ error: "missing fields" });

  await connectMongo();
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
