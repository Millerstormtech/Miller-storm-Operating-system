# Push Notification Setup for StormChat

## Overview
This guide will help you implement push notifications for StormChat messages in the Jamesapk Flutter application.

## Prerequisites

### 1. Firebase Project Setup
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use existing one
3. Add Android app:
   - Package name: `com.millerstorm.app` (check `android/app/build.gradle.kts`)
   - Download `google-services.json` → place in `android/app/`
4. Add iOS app:
   - Bundle ID: check `ios/Runner.xcodeproj/project.pbxproj`
   - Download `GoogleService-Info.plist` → place in `ios/Runner/`
5. Enable Cloud Messaging in Firebase Console

### 2. Get Server Key
1. Firebase Console → Project Settings → Cloud Messaging
2. Copy "Server key" - needed for backend

## Implementation Steps

### Step 1: Update pubspec.yaml
Already added the required dependencies:
```yaml
dependencies:
  firebase_core: ^3.8.1
  firebase_messaging: ^15.1.5
  flutter_local_notifications: ^18.0.1
```

### Step 2: Android Configuration

**File: `android/app/build.gradle.kts`**
Add at the top:
```kotlin
plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services") // Add this
}
```

**File: `android/build.gradle.kts`**
Add in dependencies:
```kotlin
dependencies {
    classpath("com.google.gms:google-services:4.4.0")
}
```

**File: `android/app/src/main/AndroidManifest.xml`**
Add permissions and service:
```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.VIBRATE"/>

<application>
    <!-- Add this inside <application> -->
    <meta-data
        android:name="com.google.firebase.messaging.default_notification_channel_id"
        android:value="stormchat_channel" />
</application>
```

### Step 3: iOS Configuration

**File: `ios/Runner/AppDelegate.swift`**
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
    } else {
      let settings: UIUserNotificationSettings =
        UIUserNotificationSettings(types: [.alert, .badge, .sound], categories: nil)
      application.registerUserNotificationSettings(settings)
    }
    
    application.registerForRemoteNotifications()
    
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
```

**File: `ios/Podfile`**
Add at the top:
```ruby
platform :ios, '13.0'
```

### Step 4: Backend Setup

**File: `pages/api/storm-chat/messages/[groupId].ts`**
The notification creation is already implemented! Just need to add FCM push:

1. Install Firebase Admin SDK:
```bash
npm install firebase-admin
```

2. Get Firebase service account key:
   - Firebase Console → Project Settings → Service Accounts
   - Generate new private key → save as `firebase-service-account.json`
   - Add to `.env`: `FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json`

3. Backend will send push notifications automatically when messages are created

### Step 5: Store FCM Tokens

The Flutter app will automatically:
1. Request notification permissions
2. Get FCM token
3. Send token to backend
4. Update token on app start

Backend stores tokens in User model for sending push notifications.

## Testing

1. **Test on Android:**
   - Build: `flutter build apk`
   - Install on device
   - Send a message from another user
   - Should receive notification even when app is closed

2. **Test on iOS:**
   - Build: `flutter build ios`
   - Install on device (requires Apple Developer account)
   - Send a message from another user
   - Should receive notification

## Notification Types

1. **Mention Notification** - When someone mentions you with @name
   - Title: "You were mentioned by [Name]"
   - Priority: High
   - Sound: Default

2. **New Message** - Regular chat messages
   - Title: "New message in [Group Name]"
   - Body: "[Sender]: [Message preview]"
   - Priority: Normal

## Troubleshooting

1. **No notifications on Android:**
   - Check `google-services.json` is in `android/app/`
   - Verify package name matches Firebase
   - Check notification permissions granted

2. **No notifications on iOS:**
   - Check `GoogleService-Info.plist` is in `ios/Runner/`
   - Verify Bundle ID matches Firebase
   - Check notification permissions granted
   - Requires physical device (not simulator)

3. **Token not saving:**
   - Check backend API `/api/users/[id]` accepts `fcmToken` field
   - Check network logs in Flutter

## Next Steps

After setup:
1. Test notifications with multiple users
2. Customize notification sounds
3. Add notification actions (reply, mark as read)
4. Implement notification badges
