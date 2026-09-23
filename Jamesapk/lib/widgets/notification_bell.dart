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
  State<NotificationBell> createState() => NotificationBellState();
}

class NotificationBellState extends State<NotificationBell> {
  List<ns.Notification> _notifications = [];
  int _unreadCount = 0;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchNotifications();
  }

  /// Re-fetches the unread count/list. Called by a parent screen's own
  /// pull-to-refresh (via a `GlobalKey<NotificationBellState>`) so the bell
  /// doesn't go stale between the once-per-mount initState fetch and whatever
  /// else the user does on that screen — matches the web bell's freshness
  /// (Header.tsx's NotificationBell polls every 20s on its own).
  Future<void> refresh() => _fetchNotifications();

  Future<void> _fetchNotifications() async {
    final notifications = await ns.NotificationService.fetchNotifications(widget.userId);
    setState(() {
      _notifications = notifications;
      _unreadCount = notifications.where((n) => !n.read).length;
      _isLoading = false;
    });
  }

  // GET only ever returns unread notifications (matches the web bell), so
  // marking them all read simply empties the list — same "seen -> gone" feel
  // as tapping one, just for everything at once.
  Future<void> _markAllAsRead() async {
    setState(() {
      _notifications = [];
      _unreadCount = 0;
    });
    await ns.NotificationService.markAllAsRead();
    if (mounted) _fetchNotifications();
  }

  Future<void> _handleNotificationTap(ns.Notification notification) async {
    // Close the notification popup FIRST so the destination screen isn't pushed
    // behind the open menu (that's why tapping used to do "nothing").
    final nav = Navigator.of(context);
    if (nav.canPop()) nav.pop();

    // Mark it read / remove it and refresh in the background — navigation must
    // not wait on the network round-trip.
    ns.NotificationService.deleteNotification(notification.id)
        .then((_) { if (mounted) _fetchNotifications(); })
        .catchError((_) {});

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
        clipBehavior: Clip.none,
        children: [
          // Gold 🔔 emoji to match the web notification bell (was a plain
          // outlined Material icon). Nudged up a touch so it sits centered in
          // the header instead of low.
          Transform.translate(
            offset: const Offset(0, -7),
            child: const Text('🔔', style: TextStyle(fontSize: 27)),
          ),
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
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Notifications',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (_notifications.isNotEmpty)
                        GestureDetector(
                          onTap: () {
                            Navigator.of(context).pop(); // close the popup menu first
                            _markAllAsRead();
                          },
                          child: const Text(
                            'Mark all as read',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFFCB0002),
                            ),
                          ),
                        ),
                    ],
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
                    return InkWell(
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
