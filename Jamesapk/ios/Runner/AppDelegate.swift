import Flutter
import UIKit
import FirebaseCore
import FirebaseMessaging

@main
@objc class AppDelegate: FlutterAppDelegate, MessagingDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    FirebaseApp.configure()

    // Register plugins FIRST so Flutter engine is ready
    GeneratedPluginRegistrant.register(with: self)

    // Set delegate AFTER Firebase configure but BEFORE registerForRemoteNotifications
    Messaging.messaging().delegate = self
    UNUserNotificationCenter.current().delegate = self

    UNUserNotificationCenter.current().requestAuthorization(
      options: [.alert, .badge, .sound],
      completionHandler: { granted, error in
        print("APNS PERMISSION => granted=\(granted), error=\(String(describing: error))")
        // Always register, even if granted is false (for provisional)
        DispatchQueue.main.async {
          UIApplication.shared.registerForRemoteNotifications()
        }
      }
    )

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(_ application: UIApplication,
                             didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
    print("APNS TOKEN => \(tokenString)")
    // Forward to Firebase - plugin also does this but explicit is safer
    Messaging.messaging().apnsToken = deviceToken
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  override func application(_ application: UIApplication,
                             didFailToRegisterForRemoteNotificationsWithError error: Error) {
    print("APNS REGISTRATION FAILED => \(error.localizedDescription)")
  }

  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    print("FCM TOKEN (native) => \(fcmToken ?? "nil")")
  }
}
