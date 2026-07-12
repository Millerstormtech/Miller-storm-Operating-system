import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { requireRole, allowMethods } from "../../../src/lib/auth";

// Managers / admins / C-Level execs can let a sales rep fast-forward (freely
// seek) training videos — normally seeking past the watched point is blocked.
// The grant is a per-user boolean on the User record (User.fastForwardAllowed).
//
//   GET  ?memberUserId=            -> { fastForwardAllowed }
//   POST { memberUserId, allowed } -> { fastForwardAllowed }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;

  const auth = requireRole(req, res, ["manager", "admin", "c-level", "branch-manager"]);
  if (!auth) return;

  await connectMongo();

  const memberUserId = (req.method === "GET" ? req.query.memberUserId : req.body?.memberUserId) as
    | string
    | undefined;
  if (!memberUserId) {
    return res.status(400).json({ error: "memberUserId is required" });
  }

  // Object-level authorization: admins/C-Level are org-wide; a manager may only
  // touch their own team (mirrors the unlock-lesson endpoint's IDOR guard).
  const member = await UserModel.findOne({ id: memberUserId })
    .select("id managerId fastForwardAllowed")
    .lean() as any;
  if (!member) return res.status(404).json({ error: "Member not found" });
  if (auth.role === "manager" && String(member.managerId) !== String(auth.sub)) {
    return res.status(403).json({ error: "Forbidden: member is not on your team" });
  }

  if (req.method === "GET") {
    return res.status(200).json({ fastForwardAllowed: !!member.fastForwardAllowed });
  }

  // POST — set the flag.
  const allowed = !!req.body?.allowed;
  await UserModel.updateOne({ id: memberUserId }, { $set: { fastForwardAllowed: allowed } });
  return res.status(200).json({ fastForwardAllowed: allowed });
}
