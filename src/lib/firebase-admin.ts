import * as admin from 'firebase-admin';
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

export async function sendPushNotification(
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
    if (!firebaseApp) {
      initializeFirebase();
    }

    if (!firebaseApp) {
      await logToDb('error', 'PUSH-NOTIFICATION', 'Firebase not initialized (multicast)');
      return { successCount: 0, failureCount: fcmTokens.length };
    }

    // Use individual sends in a loop to match test-push.js which is working
    const results = await Promise.all(fcmTokens.map(token => 
      sendPushNotification(token, title, body, data)
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
