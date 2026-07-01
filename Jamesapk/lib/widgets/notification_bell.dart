import 'package:flutter/material.dart';
import '../services/notification_service.dart' as ns;
import '../screens/storm_chat_room_screen.dart';
import '../screens/course_detail_screen.dart';
import 'package:intl/intl.dart';

class NotificationBell extends StatefulWidget {
  final String userId;
  final String? userRole;

  const NotificationBell({super.key, required this.userId, this.userRole});

  @override
  State<NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends State<NotificationBell> {
  List<ns.Notification> _notifications = [];
  int _unreadCount = 0;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchNotifications();
  }

  Future<void> _fetchNotifications() async {
    final notifications = await ns.NotificationService.fetchNotifications(widget.userId);
    setState(() {
      _notifications = notifications;
      _unreadCount = notifications.where((n) => !n.read).length;
      _isLoading = false;
    });
  }

  Future<void> _handleNotificationTap(ns.Notification notification) async {
    // Delete the notification
    await ns.NotificationService.deleteNotification(notification.id);
    
    // Refresh the list
    await _fetchNotifications();
    
    // Handle navigation based on notification type
    if (notification.type == 'stormchat_message' || notification.type == 'stormchat_mention') {
      // Get group info from metadata
      final groupId = notification.metadata?['groupId']?.toString();
      final groupName = notification.metadata?['groupName']?.toString();
      
      if (groupId != null && groupId.isNotEmpty) {
        // Navigate to chat room
        if (mounted) {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => StormChatRoomScreen(
                group: {'id': groupId, 'name': groupName ?? 'Chat'},
                userId: widget.userId,
                userRole: widget.userRole ?? '',
              ),
            ),
          );
        }
      }
    } else if (notification.type == 'course_added' ||
        notification.type == 'new_training') {
      // "New lesson/quiz" notification -> open the course and jump into the
      // new page (when we know which one).
      final courseId = notification.metadata?['courseId']?.toString();
      final courseName =
          notification.metadata?['courseName']?.toString() ?? 'Course';
      final lessonId = notification.metadata?['lessonId']?.toString();

      if (courseId != null && courseId.isNotEmpty && mounted) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => CourseDetailScreen(
              courseId: courseId,
              courseTitle: courseName,
              initialPageId:
                  (lessonId != null && lessonId.isNotEmpty) ? lessonId : null,
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return PopupMenuButton<int>(
      icon: Stack(
        children: [
          const Icon(Icons.notifications_outlined, size: 24),
          if (_unreadCount > 0)
            Positioned(
              right: 0,
              top: 0,
              child: Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: Colors.red,
                  borderRadius: BorderRadius.circular(8),
                ),
                constraints: const BoxConstraints(
                  minWidth: 16,
                  minHeight: 16,
                ),
                child: Text(
                  _unreadCount > 99 ? '99+' : _unreadCount.toString(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
        ],
      ),
      onSelected: (value) {
        // Handle menu item selection
      },
      itemBuilder: (context) => [
        PopupMenuItem<int>(
          enabled: false,
          child: SizedBox(
            width: 300,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                  child: Text(
                    'Notifications',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const Divider(height: 1),
                if (_isLoading)
                  const SizedBox(
                    height: 150,
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_notifications.isEmpty)
                  SizedBox(
                    height: 150,
                    child: Center(
                      child: Text(
                        'No notifications',
                        style: TextStyle(
                          color: isDark ? Colors.grey[400] : Colors.grey[600],
                        ),
                      ),
                    ),
                  )
                else
                  ..._notifications.take(10).map((notification) {
                    return PopupMenuItem<int>(
                      value: 0,
                      child: InkWell(
                        onTap: () => _handleNotificationTap(notification),
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                          decoration: BoxDecoration(
                            color: notification.read
                                ? Colors.transparent
                                : (isDark ? Colors.orange[900]?.withOpacity(0.2) : Colors.orange[50]),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                notification.title,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                notification.message,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isDark ? Colors.grey[400] : Colors.grey[600],
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _formatDateTime(notification.createdAt),
                                style: TextStyle(
                                  fontSize: 11,
                                  color: isDark ? Colors.grey[500] : Colors.grey[500],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  }).toList(),
              ],
            ),
          ),
        ),
      ],
    );
  }

  String _formatDateTime(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);

    if (difference.inDays > 7) {
      return DateFormat('MMM d, yyyy').format(dateTime);
    } else if (difference.inDays > 0) {
      return '${difference.inDays} days ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours} hours ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes} minutes ago';
    } else {
      return 'Just now';
    }
  }
}
