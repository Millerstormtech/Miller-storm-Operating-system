# Quick Start: Push Notifications for StormChat

## What I've Done

I've implemented push notifications for your StormChat feature. Here's what's been added:

### 1. Flutter App Changes ✅
- Added Firebase dependencies to `pubspec.yaml`
- Created `FirebaseMessagingService` to handle notifications
- Updated `main.dart` to initialize Firebase on app start
- Notifications will work when:
  - Someone mentions you with @name (high priority)
  - Someone sends a message in your groups (normal priority)

### 2. Backend Changes ✅
- Created `firebase-admin.ts` for sending push notifications
- Updated StormChat messages API to send push notifications
- Notifications are sent to all group members except the sender

## What You Need to Do

### Step 1: Firebase Setup (15 minutes)

1. **Create Firebase Project:**
   - Go to https://console.firebase.google.com/
   - Click "Add project" or use existing
   - Follow the wizard

2. **Add Android App:**
   - Click Android icon
   - Package name: Check `android/app/build.gradle.kts` for `applicationId`
   - Download `google-services.json`
   - Place in: `Jamesapk/android/app/google-services.json`

3. **Add iOS App:**
   - Click iOS icon
   - Bundle ID: Check `ios/Runner.xcodeproj/project.pbxproj`
   - Download `GoogleService-Info.plist`
   - Place in: `Jamesapk/ios/Runner/GoogleService-Info.plist`

4. **Get Service Account Key (for backend):**
   - Firebase Console → Project Settings → Service Accounts
   - Click "Generate new private key"
   - Save as `firebase-service-account.json` in project root
   - Add to `.env`: `FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json`

### Step 2: Android Configuration (5 minutes)

**File: `Jamesapk/android/build.gradle.kts`**
```kotlin
buildscript {
    dependencies {
        classpath("com.google.gms:google-services:4.4.0")
    }
}
```

**File: `Jamesapk/android/app/build.gradle.kts`**
Add at the top after other plugins:
```kotlin
plugins {
    // ... existing plugins
    id("com.google.gms.google-services")
}
```

**File: `Jamesapk/android/app/src/main/AndroidManifest.xml`**
Add inside `<application>` tag:
```xml
<meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="stormchat_channel" />
```

### Step 3: iOS Configuration (5 minutes)

**File: `Jamesapk/ios/Podfile`**
Update platform version:
```ruby
platform :ios, '13.0'
```

**File: `Jamesapk/ios/Runner/AppDelegate.swift`**
Replace entire file with:
```swift
import UIKit
import Flutter
import FirebaseCore
import FirebaseMessaging

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    FirebaseApp.configure()
    
    if #available(iOS 10.0, *) {
      UNUserNotificationCenter.current().delegate = self
      let authOptions: UNAuthorizationOptions = [.alert, .badge, .sound]
      UNUserNotificationCenter.current().requestAuthorization(
        options: authOptions,
        completionHandler: { _, _ in }
      )
    }
    
    application.registerForRemoteNotifications()
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
```

### Step 4: Backend Setup (2 minutes)

**Install Firebase Admin SDK:**
```bash
cd d:\Office\james
npm install firebase-admin
```

**Update User Model to store FCM tokens:**
Check if `src/lib/models/User.ts` has `fcmToken` field. If not, add:
```typescript
fcmToken: { type: String, default: '' }
```

### Step 5: Build and Test

**Android:**
```bash
cd Jamesapk
flutter pub get
flutter build apk
```

**iOS:**
```bash
cd Jamesapk
flutter pub get
cd ios
pod install
cd ..
flutter build ios
```

## How It Works

1. **User opens app** → Firebase gets device token → Saves to backend
2. **Someone sends message** → Backend creates notification → Sends push to all members
3. **User receives notification** → Shows in device notification tray
4. **User taps notification** → Opens app to that chat group

## Notification Types

### 1. Mention Notification (High Priority)
- **Trigger:** Someone uses @YourName in a message
- **Title:** "You were mentioned by John Doe"
- **Body:** Message preview (first 100 chars)
- **Sound:** Default notification sound
- **Badge:** Shows unread count

### 2. New Message (Normal Priority)
- **Trigger:** New message in any group you're in
- **Title:** "New message in Sales Team"
- **Body:** "John Doe: Hey everyone, check this out..."
- **Sound:** Default notification sound
- **Badge:** Shows unread count

## Testing

1. **Install app on 2 devices**
2. **Login as different users**
3. **Send message from Device 1**
4. **Device 2 should receive notification** (even if app is closed)

## Troubleshooting

**No notifications received:**
- Check `google-services.json` is in correct location
- Verify package name matches Firebase console
- Check notification permissions granted
- Look for FCM token in app logs: "📱 FCM Token: ..."

**Notifications only work when app is open:**
- Check background message handler is registered
- Verify Firebase service account key is correct
- Check backend logs for push notification errors

**iOS notifications not working:**
- Requires physical device (not simulator)
- Check Apple Developer account has push notification capability
- Verify Bundle ID matches Firebase console

## Next Steps

After basic notifications work:
1. Add notification badges showing unread count
2. Add notification actions (Reply, Mark as Read)
3. Customize notification sounds
4. Add notification grouping by chat group
5. Implement notification history

## Support

If you need help:
1. Check Firebase Console → Cloud Messaging for delivery stats
2. Check app logs for FCM token and errors
3. Check backend logs for push notification sending
4. Verify all configuration files are in correct locations
