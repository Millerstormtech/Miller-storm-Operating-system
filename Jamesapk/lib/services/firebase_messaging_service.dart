import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:http/http.dart' as http;
import 'api_client.dart';
import 'dart:convert';
import 'dart:io';
import 'auth_service.dart';
import '../firebase_options.dart';
import '../screens/storm_chat_room_screen.dart';
import '../screens/course_detail_screen.dart';
import 'package:flutter/material.dart';

class FirebaseMessagingService {
  static final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;
  static final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();
  static GlobalKey<NavigatorState>? _navigatorKey;

  static void setNavigatorKey(GlobalKey<NavigatorState> key) {
    _navigatorKey = key;
  }

  static Future<void> initialize() async {
    // Request permission
    NotificationSettings settings = await _firebaseMessaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    print('NOTIFICATION PERMISSION => ${settings.authorizationStatus}');

    if (settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional) {

      // Do NOT let the OS auto-present in foreground — we show our own local
      // notification in _handleForegroundMessage. Leaving alert/sound on here
      // would display the banner twice (OS banner + local notification).
      await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
        alert: false,
        badge: true,
        sound: false,
      );

      // Initialize local notifications
      const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
      const iosSettings = DarwinInitializationSettings(
        requestAlertPermission: true,
        requestBadgePermission: true,
        requestSoundPermission: true,
      );
      await _localNotifications.initialize(
        const InitializationSettings(android: androidSettings, iOS: iosSettings),
        onDidReceiveNotificationResponse: _onNotificationTapped,
      );

      // Android notification channel
      await _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(const AndroidNotificationChannel(
            'stormchat_channel',
            'StormChat Messages',
            description: 'Notifications for StormChat messages',
            importance: Importance.high,
            playSound: true,
          ));

      // iOS: wait for APNS token before getting FCM token
      await _getAndSaveFCMToken();

      // Listen for token refresh
      _firebaseMessaging.onTokenRefresh.listen((token) {
        print('FCM TOKEN REFRESHED => $token');
        _saveFCMToken(token);
      });

      FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
      FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

      // App opened from a TERMINATED (fully closed) state by tapping a
      // notification — getInitialMessage returns the message that launched it.
      // Delay so the Navigator is ready before we push a screen.
      final initialMessage = await FirebaseMessaging.instance.getInitialMessage();
      if (initialMessage != null) {
        Future.delayed(const Duration(milliseconds: 1000), () {
          _handleNotificationTap(initialMessage);
        });
      }
    } else {
      print('NOTIFICATION PERMISSION DENIED => ${settings.authorizationStatus}');
    }
  }

  /// iOS requires APNS token to be available before FCM token can be fetched.
  /// This method retries up to 5 times with a delay.
  static Future<void> _getAndSaveFCMToken() async {
    if (Platform.isIOS) {
      String? apnsToken;
      for (int i = 0; i < 5; i++) {
        apnsToken = await _firebaseMessaging.getAPNSToken();
        print('APNS TOKEN (attempt ${i + 1}) => $apnsToken');
        if (apnsToken != null) break;
        await Future.delayed(const Duration(seconds: 2));
      }
      if (apnsToken == null) {
        print('APNS TOKEN => null after retries. FCM token cannot be fetched on iOS.');
        return;
      }
    }

    final fcmToken = await _firebaseMessaging.getToken();
    print('FCM TOKEN => $fcmToken');

    if (fcmToken != null) {
      await _saveFCMToken(fcmToken);
    } else {
      print('FCM TOKEN => null, token not saved');
    }
  }

  static Future<void> _saveFCMToken(String token) async {
    try {
      final user = await AuthService.getStoredUser();
      if (user == null) {
        print('FCM SAVE SKIPPED => No logged in user. Token will be saved after login.');
        return;
      }

      final userId = user['id'] ?? user['_id'];
      print('USER ID => $userId');
      print('FCM TOKEN => $token');

      final response = await api.patch(
        Uri.parse('https://millerstorm.tech/api/users/$userId'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'fcmToken': token}),
      );

      print('API STATUS => ${response.statusCode}');
      print('API RESPONSE => ${response.body}');

      if (response.statusCode == 200) {
        print('✅ FCM token saved to backend');
      } else {
        print('❌ Failed to save FCM token: ${response.statusCode}');
      }
    } catch (e) {
      print('❌ Error saving FCM token: $e');
    }
  }

  /// Call this after user logs in so token gets saved immediately
  static Future<void> saveTokenAfterLogin() async {
    await _getAndSaveFCMToken();
  }

  static Future<void> _handleForegroundMessage(RemoteMessage message) async {
    print('📨 Foreground message: ${message.notification?.title}');
    final notification = message.notification;
    if (notification != null) {
      await _localNotifications.show(
        notification.hashCode,
        notification.title,
        notification.body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            'stormchat_channel',
            'StormChat Messages',
            channelDescription: 'Notifications for StormChat messages',
            importance: Importance.high,
            priority: Priority.high,
            icon: '@mipmap/ic_launcher',
            playSound: true,
          ),
          iOS: const DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
          ),
        ),
        payload: json.encode(message.data),
      );
    }
  }

  static void _onNotificationTapped(NotificationResponse response) {
    if (response.payload != null) {
      final data = json.decode(response.payload!);
      _handleNotificationTap(RemoteMessage(data: data));
    }
  }

  static void _handleNotificationTap(RemoteMessage message) async {
    print('🔔 Notification tapped: ${message.data}');
    final data = message.data;
    final type = data['type'];

    if (_navigatorKey?.currentState == null) return;

    // New training (new lesson/quiz published) -> open that course.
    if (type == 'new_training' && data['courseId'] != null) {
      print('🚀 Navigating to course: ${data['courseId']}');
      _navigatorKey!.currentState!.push(
        MaterialPageRoute(
          builder: (context) => CourseDetailScreen(
            courseId: data['courseId'].toString(),
            courseTitle: (data['courseName'] ?? 'Course').toString(),
          ),
        ),
      );
      return;
    }

    // Ticket status update -> open the user's tickets screen.
    if (type == 'ticket_update') {
      print('🚀 Navigating to tickets');
      _navigatorKey!.currentState!.pushNamed('/tickets');
      return;
    }

    // StormChat message/mention -> open the chat room (existing behavior).
    final groupId = data['groupId'];
    if (groupId != null && _navigatorKey != null) {
      print('🚀 Navigating to group: $groupId');

      try {
        // Fetch group details
        final response = await api.get(
          Uri.parse('https://millerstorm.tech/api/storm-chat/groups/$groupId'),
        );

        if (response.statusCode == 200) {
          final group = json.decode(response.body);
          final user = await AuthService.getStoredUser();
          
          if (user != null && _navigatorKey?.currentState != null) {
            final userId = user['_id'] ?? user['id'];
            final userRole = user['role'];

            _navigatorKey!.currentState!.push(
              MaterialPageRoute(
                builder: (context) => StormChatRoomScreen(
                  group: group,
                  userId: userId,
                  userRole: userRole,
                ),
              ),
            );
          }
        }
      } catch (e) {
        print('❌ Error in deep linking: $e');
      }
    }
  }
}

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  print('📨 Background message: ${message.notification?.title}');
}
