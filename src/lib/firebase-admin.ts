import * as admin from 'firebase-admin';
import { pushTargets, isDeadDeviceError } from './pushDevices';
import * as fs from 'fs';
import * as path from 'path';
import { logToDb } from './models/SystemLog';

let firebaseApp: admin.app.App | null = null;

export function initializeFirebase() {
  if (firebaseApp) return firebaseApp;

  try {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
    const absolutePath = path.resolve(serviceAccountPath);
    
    // Check if file exists (only needed at runtime, not build time)
    if (!fs.existsSync(absolutePath)) {
      console.warn(`⚠️  Firebase service account file not found at ${absolutePath}. Push notifications will not work.`);
      return null;
    }
    
    // Read the file content
    const serviceAccountContent = fs.readFileSync(absolutePath, 'utf8');
    const serviceAccount = JSON.parse(serviceAccountContent);

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('✅ Firebase Admin initialized');
    return firebaseApp;
  } catch (error: any) {
    console.error('❌ Firebase Admin initialization failed:', error);
    return null;
  }
}

// Widen the requested device address(es) to every device of their owners,
// so a push meant for someone reaches their phone AND their browser.
async function allDevicesOf(tokens: string[]): Promise<string[]> {
  const wanted = tokens.filter(Boolean);
  if (!wanted.length) return [];
  try {
    const { UserModel } = await import('./models/User');
    const owners = await UserModel.find(
      { $or: [{ fcmToken: { $in: wanted } }, { fcmTokens: { $in: wanted } }] },
      { fcmToken: 1, fcmTokens: 1 },
    ).lean() as any[];
    return pushTargets(wanted, owners);
  } catch {
    return wanted;
  }
}

// Remove one device from the matching people; their newest REMAINING device
// becomes fcmToken, so older devices keep getting alerts.
export async function dropDeviceFrom(UserModel: any, filter: any, token: string) {
  const users = await UserModel.find(filter, { _id: 1, fcmTokens: 1 }).lean() as any[];
  for (const u of users) {
    const rest = (u.fcmTokens || []).filter((t: string) => t && t !== token);
    await UserModel.updateOne({ _id: u._id }, { $set: { fcmTokens: rest, fcmToken: rest[rest.length - 1] || '' } });
  }
}

// A device Google says is gone (uninstalled, logged out) is removed so we
// stop sending to it.
async function forgetDevice(token: string) {
  try {
    const { UserModel } = await import('./models/User');
    await dropDeviceFrom(UserModel, { $or: [{ fcmToken: token }, { fcmTokens: token }] }, token);
  } catch { /* best effort */ }
}

/** Send to ONE person's devices: `fcmToken` is any one of them (usually User.fcmToken). */
export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: { [key: string]: string }
) {
  const tokens = await allDevicesOf([fcmToken]);
  const results = await Promise.all(tokens.map((t) => sendToDevice(t, title, body, data)));
  return results.some(Boolean);
}

async function sendToDevice(
  fcmToken: string,
  title: string,
  body: string,
  data?: { [key: string]: string }
) {
  try {
    if (!firebaseApp) {
      initializeFirebase();
    }

    if (!firebaseApp) {
      await logToDb('error', 'PUSH-NOTIFICATION', 'Firebase not initialized');
      return false;
    }

    const message: admin.messaging.Message = {
      notification: {
        title,
        body,
      },
      data: {
        ...(data || {}),
        title, // Duplicate for some older clients
        body,  // Duplicate for some older clients
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      token: fcmToken,
      android: {
        priority: 'high',
        notification: {
          channelId: 'stormchat_channel',
          sound: 'default',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            'content-available': 1,
            'mutable-content': 1,
          },
        },
      },
    };

    console.log(`[PUSH-DEBUG] Payload being sent to Firebase: ${JSON.stringify(message, null, 2)}`);
    const response = await admin.messaging().send(message);
    await logToDb('info', 'PUSH-NOTIFICATION', `✅ Successfully sent to token ending in ...${fcmToken.slice(-10)}`, { title });
    return true;
  } catch (error: any) {
    await logToDb('error', 'PUSH-NOTIFICATION', `❌ Failed to send to token ending in ...${fcmToken.slice(-10)}: ${error.message}`);
    if (isDeadDeviceError(error?.code || error?.errorInfo?.code)) await forgetDevice(fcmToken);
    return false;
  }
}

export async function sendPushNotificationToMultiple(
  fcmTokens: string[],
  title: string,
  body: string,
  data?: { [key: string]: string }
) {
  try {
    // Every device of every recipient, each address once (the same token can
    // come from more than one place). Worked out (and logged) before the
    // Firebase check so who-gets-what can be verified without sending.
    const uniqueTokens = await allDevicesOf(Array.from(new Set(fcmTokens.filter(Boolean))));
    await logToDb('info', 'PUSH-TARGETS', `${uniqueTokens.length} device(s) for "${title}"`, { devices: uniqueTokens.length });

    if (!firebaseApp) {
      initializeFirebase();
    }

    if (!firebaseApp) {
      await logToDb('error', 'PUSH-NOTIFICATION', 'Firebase not initialized (multicast)');
      return { successCount: 0, failureCount: uniqueTokens.length };
    }

    // Use individual sends in a loop to match test-push.js which is working
    const results = await Promise.all(uniqueTokens.map(token =>
      sendToDevice(token, title, body, data)
    ));

    const successCount = results.filter(r => r === true).length;
    const failureCount = results.length - successCount;

    await logToDb('info', 'PUSH-NOTIFICATION', `📊 Batch Result: ${successCount} success, ${failureCount} failed`, { title });
    
    return { successCount, failureCount };
  } catch (error: any) {
    await logToDb('error', 'PUSH-NOTIFICATION', `❌ Multicast critical error: ${error.message}`);
    return { successCount: 0, failureCount: fcmTokens.length };
  }
}
