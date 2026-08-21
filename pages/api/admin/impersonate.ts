// POST /api/admin/impersonate  { userId }  ->  { token }
//
// Backs the admin "View As" feature. Mints a session token whose SUBJECT is the
// target user, so that while the admin browses another account EVERY API call
// returns the target's data — sales numbers, courses, course progress, profile,
// everything — instead of the admin's own. Endpoints key off the token's `sub`
// (auth.sub), so swapping the token is what makes the whole app show the target;
// passing ?userId= per screen only fixed the few endpoints that read it.
//
// The minted token carries the TARGET's real role (looked up from the DB, never
// taken from the caller), so admin-only endpoints stay correctly closed while
// impersonating a rep. Writes are additionally blocked on the client in
// view-only mode. Admin-only: only an admin may mint an impersonation token.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { requireUser, allowMethods, signSession } from "../../../src/lib/auth";
import { UserModel } from "../../../src/lib/models/User";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;
  if (auth.role !== "admin") {
    res.status(403).json({ error: "Only admins can use View As" });
    return;
  }

  const { userId } = (req.body || {}) as { userId?: string };
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  await connectMongo();
  const target = (await UserModel.findOne({ id: userId }).lean()) as any;
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const token = signSession({ id: String(target.id), role: String(target.role) });
  res.status(200).json({ token });
}
