import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";
import { NotificationModel } from "../../src/lib/models/Notification";
import { requireUser, allowMethods } from "../../src/lib/auth";
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

  // History is readable by ANY signed-in user (announcements are company-wide
  // anyway); composing — and the audience count for the composer — stays with
  // the leadership roles.
  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  // GET ?history=1 → every announcement ever sent, newest first. There is no
  // separate Announcements collection: each send wrote one Notification row per
  // recipient sharing the same `notif-<stamp>-<i>` id stamp, so collapse the
  // rows back to one entry per stamp (per-user rows may have been dismissed and
  // deleted, but an announcement survives as long as ANY recipient's row does).
  if (req.method === "GET" && req.query.history) {
    const history = await NotificationModel.aggregate([
      { $match: { type: "announcement" } },
      { $addFields: { stamp: { $arrayElemAt: [{ $split: ["$id", "-"] }, 1] } } },
      {
        $group: {
          _id: "$stamp",
          title: { $first: "$title" },
          message: { $first: "$message" },
          link: { $first: "$metadata.link" },
          postedByName: { $first: "$metadata.postedByName" },
          createdAt: { $first: "$createdAt" },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 100 },
    ]);
    return res.status(200).json(history.map((h: any) => ({
      title: h.title,
      message: h.message,
      link: h.link || "",
      postedByName: h.postedByName || "",
      createdAt: h.createdAt,
    })));
  }

  // Composer roles: admin & c-level only — same on web and mobile. Everyone
  // else (sales, team leads, branch managers) only reads the history above.
  const composerRoles = ["admin", "c-level"];
  if (!composerRoles.includes(auth.role || "")) {
    return res.status(403).json({ error: "Forbidden" });
  }

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
