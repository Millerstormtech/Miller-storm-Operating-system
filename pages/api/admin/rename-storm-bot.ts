// POST /api/admin/rename-storm-bot  (admin only)
//
// One-time data fix: existing celebration messages were posted with the sender
// name "Storm Bot" (the bot was renamed to "Miller Storm" going forward). This
// updates every already-stored message and notification so the old ones show
// "Miller Storm" too — the chat renders msg.senderName for both the name and
// the avatar initials, so this also flips the "SB" avatar to "MS".
//
// Idempotent: safe to run more than once (already-renamed rows simply don't
// match). The internal senderId "storm-bot" is left unchanged.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import ChatMessage from "../../../src/lib/models/ChatMessage";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { requireRole, allowMethods } from "../../../src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET is allowed too (it's idempotent + admin-only) so a signed-in admin can
  // run it by simply opening the URL in the browser — the session cookie
  // authenticates the request, no manual token needed.
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  if (!requireRole(req, res, "admin")) return;

  await connectMongo();

  // Messages: match by the stable bot id (preferred) or the old display name.
  const messages = await ChatMessage.updateMany(
    { $or: [{ senderId: "storm-bot" }, { senderName: "Storm Bot" }] },
    { $set: { senderName: "Miller Storm" } }
  );

  // Notifications carry the name inline as "Storm Bot: ...". Rewrite the prefix.
  const notifs = await NotificationModel.updateMany(
    { message: { $regex: "^Storm Bot:" } },
    [{ $set: { message: { $replaceOne: { input: "$message", find: "Storm Bot:", replacement: "Miller Storm:" } } } }]
  );

  return res.status(200).json({
    ok: true,
    messagesRenamed: messages.modifiedCount ?? 0,
    notificationsRenamed: notifs.modifiedCount ?? 0,
  });
}
