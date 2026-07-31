import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";
import { NotificationModel } from "../../src/lib/models/Notification";
import { requireRole, allowMethods } from "../../src/lib/auth";
import { sendPushNotificationToMultiple } from "../../src/lib/firebase-admin";

// Company-wide announcements. Admin & C-Level only.
//
// Modelled on notify-update.ts, but targets EVERYONE (all active, non-deleted,
// non-suspended users), not just sales roles. One Notification row is written
// per recipient, which gives per-person read/dismiss for free (no new tracking
// collection), and a phone push goes out reusing the existing FCM helper.
//
//   GET  → { recipients } — the audience size, for the composer's confirm step.
//   POST → send the announcement; returns the recipient + push counts.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;

  // Only admin and c-level may see the audience size or post.
  const auth = requireRole(req, res, ["admin", "c-level"]);
  if (!auth) return;

  await connectMongo();

  // Everyone active — no role/branch/team targeting in phase one.
  const audienceFilter = { deleted: { $ne: true }, suspended: { $ne: true } };

  if (req.method === "GET") {
    const recipients = await UserModel.countDocuments(audienceFilter);
    return res.status(200).json({ recipients });
  }

  // POST — send the announcement.
  const title = (req.body?.title as string)?.trim();
  const message = (req.body?.message as string)?.trim();
  const link = (req.body?.link as string)?.trim() || "";
  // Never blast an empty message to the whole company.
  if (!title || !message) {
    return res.status(400).json({ error: "Title and message are required." });
  }

  // The author comes from the session, never the request body.
  const author = (await UserModel.findOne({ id: auth.sub }, { id: 1, name: 1 }).lean()) as any;

  const recipients = (await UserModel.find(audienceFilter, { id: 1, fcmToken: 1 }).lean()) as any[];

  // Phone push to every device we have a token for.
  const pushTokens = recipients.map((u) => u.fcmToken).filter(Boolean);
  let pushResult = { successCount: 0, failureCount: 0 };
  if (pushTokens.length) {
    pushResult = await sendPushNotificationToMultiple(pushTokens, title, message, {
      type: "announcement",
      link,
    });
  }

  // One in-app notification per user → per-person dismissal + bell entry.
  const stamp = Date.now();
  const docs = recipients.map((u, i) => ({
    id: `notif-${stamp}-${i}`,
    userId: u.id,
    type: "announcement",
    title,
    message,
    read: false,
    metadata: { link, postedBy: author?.id || auth.sub, postedByName: author?.name || "" },
  }));
  if (docs.length) {
    await NotificationModel.insertMany(docs, { ordered: false });
  }

  res.status(200).json({
    success: true,
    recipients: recipients.length,
    pushTokens: pushTokens.length,
    pushSuccess: pushResult.successCount,
    pushFailed: pushResult.failureCount,
  });
}
