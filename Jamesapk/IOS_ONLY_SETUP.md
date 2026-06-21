# 🍎 iOS ONLY - Push Notifications Setup

## ✅ COMPLETED (Already Done)

- [x] Added Firebase dependencies to pubspec.yaml
- [x] Created FirebaseMessagingService
- [x] Updated main.dart with Firebase initialization
- [x] Updated .env with FIREBASE_SERVICE_ACCOUNT_PATH
- [x] Updated iOS AppDelegate.swift with Firebase
- [x] iOS Podfile already has correct platform version
- [x] Added fcmToken field to User model
- [x] Updated backend API to send push notifications
- [x] Placed GoogleService-Info.plist in ios/Runner/ ✅
- [x] Removed Android Firebase configuration (iOS only)

## 📋 REMAINING STEPS (You Need to Do)

### Step 1: Get Firebase Service Account Key (5 minutes)

1. **Go to Firebase Console:**
   - https://console.firebase.google.com/
   - Select your project

2. **Get Service Account:**
   - Click gear icon (⚙️) → Project settings
   - Click "Service accounts" tab
   - Click "Generate new private key" button
   - Click "Generate key" in the popup
   - File downloads as `your-project-xxxxx.json`

3. **Rename and place:**
   - Rename to: `firebase-service-account.json`
   - Move to: `d:\Office\james\firebase-service-account.json`
   - ⚠️ IMPORTANT: This should be in the root of james folder, NOT in Jamesapk

4. **Add to .gitignore:**
   - Open `d:\Office\james\.gitignore`
   - Add line: `firebase-service-account.json`
   - This keeps your credentials secure

### Step 2: Install Backend Dependencies (2 minutes)

Open terminal in `d:\Office\james\` and run:

```bash
npm install firebase-admin
```

### Step 3: Install Flutter Dependencies (2 minutes)

Open terminal in `d:\Office\james\Jamesapk\` and run:

```bash
flutter pub get
```

### Step 4: Install iOS Pods (3 minutes)

Open terminal in `d:\Office\james\Jamesapk\ios\` and run:

```bash
pod install
```

If you get errors, try:
```bash
pod repo update
pod install
```

### Step 5: Build iOS App (Requires Mac with Xcode)

**Option A: Using Flutter CLI**
```bash
cd d:\Office\james\Jamesapk
flutter build ios
```

**Option B: Using Xcode**
1. Open `Jamesapk/ios/Runner.xcworkspace` in Xcode (NOT .xcodeproj)
2. Select your development team in Signing & Capabilities
3. Connect your iPhone
4. Click Run button

### Step 6: Test Notifications (5 minutes)

1. Install app on 2 iOS devices (physical devices, not simulator)
2. Login as different users on each device
3. Make sure both users are in the same StormChat group
4. Send a message from Device 1
5. Device 2 should receive notification (even if app is closed)
6. Test mention: Send "@Username message" from Device 1
7. Device 2 should receive high-priority mention notification

## 🔍 VERIFICATION CHECKLIST

### Files in Place:
- [x] `Jamesapk/ios/Runner/GoogleService-Info.plist` exists
- [ ] `james/firebase-service-account.json` exists
- [x] `james/.env` has FIREBASE_SERVICE_ACCOUNT_PATH line

### Code Updated:
- [x] `Jamesapk/pubspec.yaml` has firebase dependencies
- [x] `Jamesapk/lib/main.dart` initializes Firebase
- [x] `Jamesapk/ios/Runner/AppDelegate.swift` has Firebase initialization
- [x] `james/src/lib/models/User.ts` has fcmToken field

### Dependencies Installed:
- [ ] Ran `npm install firebase-admin` in james folder
- [ ] Ran `flutter pub get` in Jamesapk folder
- [ ] Ran `pod install` in Jamesapk/ios folder

### App Builds:
- [ ] iOS builds successfully on Mac with Xcode

### Notifications Work:
- [ ] App requests notification permission on first launch
- [ ] FCM token is saved to backend (check logs)
- [ ] Regular message notifications received
- [ ] Mention notifications received
- [ ] Notifications work when app is closed
- [ ] Tapping notification opens the app

## 📱 iOS SPECIFIC REQUIREMENTS

### 1. Physical Device Required
- ⚠️ Push notifications DO NOT work on iOS Simulator
- You MUST test on a real iPhone/iPad

### 2. Apple Developer Account
- Free account: Can test on your own device
- Paid account ($99/year): Can distribute to TestFlight/App Store

### 3. Signing & Capabilities
In Xcode:
1. Open `Runner.xcworkspace`
2. Select "Runner" project
3. Go to "Signing & Capabilities" tab
4. Select your Team
5. Verify "Push Notifications" capability is added (should be automatic)

### 4. Provisioning Profile
- Xcode will automatically create a development provisioning profile
- Make sure it includes "Push Notifications" entitlement

## 🐛 TROUBLESHOOTING

### Issue: "GoogleService-Info.plist not found"
**Solution:** 
- Verify file is at: `Jamesapk/ios/Runner/GoogleService-Info.plist`
- In Xcode, check if file appears in Runner folder
- If not, drag and drop it into Xcode Runner folder

### Issue: "Firebase not initialized"
**Solution:** 
- Check if GoogleService-Info.plist is in correct location
- Run `flutter clean` then `flutter pub get`
- Delete `ios/Pods` folder and run `pod install` again

### Issue: "No notifications received"
**Solution:**
- ⚠️ Must use physical device, not simulator
- Check notification permissions granted in iOS Settings
- Check FCM token in app logs: Look for "📱 FCM Token:"
- Check backend logs for push notification sending
- Verify firebase-service-account.json is correct

### Issue: "Pod install fails"
**Solution:**
```bash
cd ios
pod repo update
pod deintegrate
pod install
```

### Issue: "Code signing error"
**Solution:**
- Open Xcode
- Select Runner target
- Go to Signing & Capabilities
- Select your Apple ID team
- Let Xcode automatically manage signing

## 📊 EXPECTED LOGS

### Flutter App Logs:
```
✅ Notification permission granted
📱 FCM Token: [long token string]
✅ FCM token saved to backend
```

### Backend Logs:
```
✅ Firebase Admin initialized
✅ Push notification sent: [message-id]
✅ Push notifications sent: 2/2
```

## 🎉 SUCCESS CRITERIA

You'll know it's working when:
1. ✅ App builds without errors on Mac/Xcode
2. ✅ App requests notification permission on launch
3. ✅ FCM token appears in logs
4. ✅ Sending a message triggers notification on other iOS devices
5. ✅ Notifications appear even when app is closed
6. ✅ Tapping notification opens the app to that chat

## ⏱️ ESTIMATED TIME

- Step 1 (Firebase service account): 5 minutes
- Step 2 (Backend dependencies): 2 minutes
- Step 3 (Flutter dependencies): 2 minutes
- Step 4 (iOS pods): 3 minutes
- Step 5 (Build on Mac): 10 minutes
- Step 6 (Testing): 5 minutes

**Total: ~27 minutes**

## 📱 TESTING SCENARIOS

### Test 1: Regular Message Notification
1. User A sends: "Hello everyone!"
2. User B receives notification: "New message in [Group Name]"
3. Notification body: "User A: Hello everyone!"

### Test 2: Mention Notification
1. User A sends: "@UserB check this out"
2. User B receives notification: "You were mentioned by User A"
3. Notification body: "@UserB check this out"
4. Should be high priority (appears at top)

### Test 3: App States
- [ ] Notification received when app is closed
- [ ] Notification received when app is in background
- [ ] Notification shown when app is in foreground
- [ ] Tapping notification opens correct chat group

## 🍎 iOS NOTIFICATION FEATURES

### Notification Appearance:
- Shows app icon
- Shows notification title
- Shows message preview
- Plays default sound
- Shows badge count
- Appears in Notification Center
- Appears on Lock Screen

### Notification Behavior:
- Banner style (top of screen)
- Can be expanded for more text
- Swipe to dismiss
- Tap to open app
- Long press for quick actions (future enhancement)

## 🚀 NEXT STEPS AFTER SETUP

Once notifications work:
1. Test with multiple iOS users
2. Test different notification scenarios
3. Customize notification sounds
4. Add notification badges
5. Implement notification actions (reply, mark as read)
6. Add rich notifications (images, videos)

## 📞 NEED HELP?

If you get stuck:
1. Check Firebase Console → Cloud Messaging for delivery stats
2. Check Xcode console for errors
3. Check backend logs for push notification errors
4. Verify GoogleService-Info.plist is in correct location
5. Make sure you're testing on physical device, not simulator

## 🔐 SECURITY NOTES

- `GoogleService-Info.plist` contains API keys (safe to include in app)
- `firebase-service-account.json` is SENSITIVE - never commit to git
- Add `firebase-service-account.json` to `.gitignore`
- FCM tokens are device-specific and expire automatically

---

**Current Status:** iOS Configuration Complete ✅
**Next Action:** Get Firebase Service Account Key
**Platform:** iOS Only 🍎
