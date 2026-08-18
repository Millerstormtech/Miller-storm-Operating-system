import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { sendPushNotificationToMultiple } from "../../../src/lib/firebase-admin";
import { requireRole, allowMethods } from "../../../src/lib/auth";
import { trainingRouteForRole } from "../../../src/lib/trainingRoute";

// Managers / admins / C-Level execs can let a sales rep fast-forward (freely
// seek) training videos — normally seeking past the watched point is blocked.
// The grant is a per-user boolean on the User record (User.fastForwardAllowed).
//
//   GET  ?memberUserId=                          -> { fastForwardAllowed }
//   POST { memberUserId | memberUserIds[], allowed } -> { fastForwardAllowed, count }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;

  const auth = requireRole(req, res, ["sales-team-lead", "admin", "c-level", "branch-manager"]);
  if (!auth) return;

  await connectMongo();

  // GET — read a single member's current flag (used by the picker).
  if (req.method === "GET") {
    const memberUserId = req.query.memberUserId as string | undefined;
    if (!memberUserId) return res.status(400).json({ error: "memberUserId is required" });
    const member = await UserModel.findOne({ id: memberUserId })
      .select("id managerId fastForwardAllowed")
      .lean() as any;
    if (!member) return res.status(404).json({ error: "Member not found" });
    if (auth.role === "sales-team-lead" && String(member.managerId) !== String(auth.sub)) {
      return res.status(403).json({ error: "Forbidden: member is not on your team" });
    }
    return res.status(200).json({ fastForwardAllowed: !!member.fastForwardAllowed });
  }

  // POST — set the flag for one OR MANY members at once.
  const memberIds: string[] = (
    Array.isArray(req.body?.memberUserIds) && req.body.memberUserIds.length
      ? req.body.memberUserIds
      : req.body?.memberUserId
      ? [req.body.memberUserId]
      : []
  )
    .map((v: any) => (v == null ? "" : String(v)))
    .filter(Boolean);
  if (memberIds.length === 0) {
    return res.status(400).json({ error: "memberUserId(s) are required" });
  }
  const allowed = !!req.body?.allowed;

  const members = await UserModel.find({ id: { $in: memberIds } })
    .select("id managerId role fcmToken")
    .lean() as any[];

  // Object-level authorization: admins/C-Level are org-wide; a manager may only
  // touch their own team (mirrors the unlock-lesson endpoint's IDOR guard).
  if (auth.role === "sales-team-lead") {
    const notOnTeam = memberIds.some((id) => {
      const m = members.find((x) => String(x.id) === String(id));
      return !m || String(m.managerId) !== String(auth.sub);
    });
    if (notOnTeam) {
      return res.status(403).json({ error: "Forbidden: some members are not on your team" });
    }
  }

  await UserModel.updateMany({ id: { $in: memberIds } }, { $set: { fastForwardAllowed: allowed } });

  // Notify each rep when fast-forward is ENABLED (not when it's revoked).
  if (allowed) {
    const title = "⏩ Fast-Forward Enabled";
    const message = "Your Sales Team Lead turned on fast-forward for your training videos.";
    for (const m of members) {
      try {
        const watchUrl = trainingRouteForRole(m.role);
        await NotificationModel.create({
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          userId: m.id,
          type: "new_training",
          title,
          message,
          read: false,
          metadata: { watchUrl },
        });
        if (m.fcmToken) {
          await sendPushNotificationToMultiple([m.fcmToken], title, message, { type: "new_training" });
        }
      } catch (notifyErr) {
        console.error("[allow-fast-forward] notify failed for", m.id, notifyErr);
      }
    }
  }

  return res.status(200).json({ fastForwardAllowed: allowed, count: memberIds.length });
}
