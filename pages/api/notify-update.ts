import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";
import { NotificationModel } from "../../src/lib/models/Notification";
import { requireRole, allowMethods } from "../../src/lib/auth";
import { sendPushNotificationToMultiple } from "../../src/lib/firebase-admin";

// Store links the "update" notification deep-links to. The app is currently
// only live on the Apple App Store, so iOS is the real target; the Play Store
// URL is kept ready for when the Android build goes live.
const IOS_STORE_URL =
  process.env.APP_IOS_URL ?? "https://apps.apple.com/in/app/millerstorm/id6771883296";
const ANDROID_STORE_URL =
  process.env.APP_ANDROID_URL ??
  "https://play.google.com/store/apps/details?id=com.millerstorm.millerstorm_app";

/**
 * Admin-triggered "please update the app" blast.
 *
 * Mirrors the new-training notification flow (see pages/api/courses/bulk.ts):
 *   1. Push notification (FCM) to every sales + manager user's device.
 *   2. An in-app bell notification so it's visible inside the app too.
 *
 * Tapping the push carries `type: 'app_update'` + the store URLs, which the
 * Flutter handler uses to open the App Store (iOS) / Play Store (Android).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!requireRole(req, res, "admin")) return;

  await connectMongo();

  const title = (req.body?.title as string)?.trim() || "🚀 New version available";
  const message =
    (req.body?.message as string)?.trim() ||
    "A new version of Miller Storm is out. Tap to update the app now.";

  const recipients = await UserModel.find(
    {
      deleted: { $ne: true },
      $or: [
        { role: { $in: ["sales", "manager"] } },
        { roles: { $in: ["sales", "manager"] } },
      ],
    },
    { id: 1, fcmToken: 1 }
  ).lean();

  // Mobile push to every device we have a token for.
  const pushTokens = (recipients as any[]).map((u) => u.fcmToken).filter(Boolean);
  let pushResult = { successCount: 0, failureCount: 0 };
  if (pushTokens.length) {
    pushResult = await sendPushNotificationToMultiple(pushTokens, title, message, {
      type: "app_update",
      iosUrl: IOS_STORE_URL,
      androidUrl: ANDROID_STORE_URL,
    });
  }

  // In-app bell notification for every user.
  const stamp = Date.now();
  const docs = (recipients as any[]).map((u, i) => ({
    id: `notif-${stamp}-${i}`,
    userId: u.id,
    type: "app_update",
    title,
    message,
    read: false,
    metadata: { iosUrl: IOS_STORE_URL, androidUrl: ANDROID_STORE_URL },
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
