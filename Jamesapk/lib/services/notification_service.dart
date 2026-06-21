import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class Notification {
  final String id;
  final String userId;
  final String type;
  final String title;
  final String message;
  final bool read;
  final Map<String, dynamic>? metadata;
  final DateTime createdAt;

  Notification({
    required this.id,
    required this.userId,
    required this.type,
    required this.title,
    required this.message,
    required this.read,
    this.metadata,
    required this.createdAt,
  });

  factory Notification.fromJson(Map<String, dynamic> json) {
    return Notification(
      id: json['id'] as String,
      userId: json['userId'] as String,
      type: json['type'] as String,
      title: json['title'] as String,
      message: json['message'] as String,
      read: json['read'] as bool,
      metadata: json['metadata'] as Map<String, dynamic>?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'userId': userId,
      'type': type,
      'title': title,
      'message': message,
      'read': read,
      'metadata': metadata,
      'createdAt': createdAt.toIso8601String(),
    };
  }
}

class NotificationService {
  static const String baseUrl = 'https://millerstorm.tech/api';

  static Future<List<Notification>> fetchNotifications(String userId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/notifications?userId=$userId'),
      );

      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        return data.map((json) => Notification.fromJson(json)).toList();
      }
      return [];
    } catch (e) {
      print('Error fetching notifications: $e');
      return [];
    }
  }

  static Future<void> markAsRead(String id) async {
    try {
      await http.put(
        Uri.parse('$baseUrl/notifications'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'id': id}),
      );
    } catch (e) {
      print('Error marking notification as read: $e');
    }
  }

  static Future<void> deleteNotification(String id) async {
    try {
      await http.delete(
        Uri.parse('$baseUrl/notifications'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'id': id}),
      );
    } catch (e) {
      print('Error deleting notification: $e');
    }
  }

  static Future<void> saveDeviceToken(String token) async {
    // Save device token for push notifications later
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('deviceToken', token);
  }
}
