import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/auth_service.dart';
import '../widgets/notification_bell.dart';
import 'storm_chat_room_screen.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';

class StormChatScreen extends StatefulWidget {
  const StormChatScreen({Key? key}) : super(key: key);

  @override
  _StormChatScreenState createState() => _StormChatScreenState();
}

class _StormChatScreenState extends State<StormChatScreen> {
  List<dynamic> groups = [];
  Map<String, int> unreadCounts = {};
  Map<String, int> mentionCounts = {};
  bool isLoading = true;
  String? userId;
  String? userRole;

  @override
  void initState() {
    super.initState();
    _loadUserAndGroups();
  }

  Future<void> _loadUserAndGroups() async {
    final user = await AuthService.getStoredUser();
    if (user != null) {
      setState(() {
        // Use _id for matching with group members
        userId = user['_id'] ?? user['id'];
        userRole = user['role'];
      });
      print('🔵 User loaded - ID: $userId, Role: $userRole');
      await _fetchGroups();
    }
  }

  Future<void> _fetchGroups() async {
    try {
      print('🔵 Fetching groups for user: $userId');
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/storm-chat/groups'),
      );

      print('🔵 Groups API response status: ${response.statusCode}');
      print('🔵 Groups API response body: ${response.body}');

      if (response.statusCode == 200) {
        final allGroups = json.decode(response.body) as List;
        print('🔵 Total groups from API: ${allGroups.length}');
        
        // Filter groups where user is a member
        final userGroups = allGroups.where((group) {
          final members = List<String>.from(group['members'] ?? []);
          return members.contains(userId);
        }).toList();

        print('🔵 User groups after filtering: ${userGroups.length}');

        setState(() {
          groups = userGroups;
          isLoading = false;
        });
        
        // Fetch unread counts
        await _fetchUnreadCounts();
      } else {
        print('❌ Failed to fetch groups: ${response.statusCode}');
        setState(() {
          isLoading = false;
        });
      }
    } catch (e) {
      print('❌ Error fetching groups: $e');
      setState(() {
        isLoading = false;
      });
    }
  }

  Future<void> _fetchUnreadCounts() async {
    if (groups.isEmpty) return;
    
    try {
      final groupIds = groups.map((g) => g['_id']).join(',');
      
      // Fetch unread counts
      final unreadResponse = await api.get(
        Uri.parse('https://millerstorm.tech/api/storm-chat/unread-counts?userId=$userId&groupIds=$groupIds'),
      );

      // Fetch mention counts
      final mentionResponse = await api.get(
        Uri.parse('https://millerstorm.tech/api/storm-chat/mention-counts?userId=$userId&groupIds=$groupIds'),
      );

      if (unreadResponse.statusCode == 200 && mentionResponse.statusCode == 200) {
        final unreadData = json.decode(unreadResponse.body) as Map<String, dynamic>;
        final mentionData = json.decode(mentionResponse.body) as Map<String, dynamic>;
        
        setState(() {
          unreadCounts = unreadData.map((key, value) => MapEntry(key, value as int));
          mentionCounts = mentionData.map((key, value) => MapEntry(key, value as int));
        });
      }
    } catch (e) {
      print('❌ Error fetching counts: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async {
        Navigator.pushReplacementNamed(context, '/courses');
        return false;
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF5F5F5),
        body: SafeArea(
          child: Column(
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'StormChat',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF111827),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              // Content
              Expanded(
                child: isLoading
                    ? const Center(child: CircularProgressIndicator(color: Color(0xFFCB0002)))
                    : groups.isEmpty
                        ? _buildEmptyState()
                        : _buildGroupsList(),
              ),
              // Bottom Navigation
              _buildBottomNav(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.chat_bubble_outline,
            size: 80,
            color: Colors.grey,
          ),
          const SizedBox(height: 16),
          const Text(
            'No groups yet',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Colors.black87,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'You haven\'t been added to any groups',
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGroupsList() {
    return RefreshIndicator(
      color: const Color(0xFFCB0002),
      onRefresh: () async {
        setState(() => isLoading = true);
        await _fetchGroups();
        await _fetchUnreadCounts();
      },
      child: Builder(
        builder: (context) {
          // Nest subgroups under their parent. A group is top-level if it has
          // no parentGroupId, or its parent isn't in the user's list (orphan →
          // show it at the top level so access isn't lost).
          final byId = { for (final g in groups) g['_id'].toString(): g };
          final topLevel = groups.where((g) {
            final pid = (g['parentGroupId'] ?? '').toString();
            return pid.isEmpty || !byId.containsKey(pid);
          }).toList();

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: topLevel.length,
            itemBuilder: (context, index) {
              final group = topLevel[index];
              final subs = groups
                  .where((g) => (g['parentGroupId'] ?? '').toString() == group['_id'].toString())
                  .toList();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildGroupCard(group),
                  ...subs.map((sub) => Padding(
                        padding: const EdgeInsets.only(left: 12),
                        child: Row(
                          children: [
                            Padding(
                              padding: const EdgeInsets.only(right: 4, bottom: 6),
                              child: Text('↳', style: TextStyle(color: Colors.grey[400], fontSize: 18)),
                            ),
                            Expanded(child: _buildGroupCard(sub, isSubgroup: true)),
                          ],
                        ),
                      )),
                ],
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildGroupCard(dynamic group, {bool isSubgroup = false}) {
    final name = group['name'] ?? 'Unnamed Group';
    final description = group['description'] ?? '';
    final imageUrl = group['imageUrl'] ?? '';
    final memberCount = (group['members'] as List?)?.length ?? 0;
    final onlyAdminCanChat = group['onlyAdminCanChat'] ?? false;
    final groupId = group['_id'];
    final unreadCount = unreadCounts[groupId] ?? 0;
    final mentionCount = mentionCounts[groupId] ?? 0;

    final subtitle = description.isNotEmpty
        ? description
        : '$memberCount member${memberCount == 1 ? '' : 's'}';

    return Container(
      margin: EdgeInsets.only(bottom: isSubgroup ? 6 : 10),
      decoration: BoxDecoration(
        color: isSubgroup ? const Color(0xFFFAFAFA) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () async {
            await Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => StormChatRoomScreen(
                  group: group,
                  userId: userId!,
                  userRole: userRole!,
                ),
              ),
            );
            // Refresh unread counts after returning from chat
            _fetchUnreadCounts();
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                // Circular group avatar (image, or gradient + initial)
                Container(
                  width: 54,
                  height: 54,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: imageUrl.isEmpty
                        ? const LinearGradient(
                            colors: [Color(0xFFCB0002), Color(0xFF7F0001)],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          )
                        : null,
                    image: imageUrl.isNotEmpty
                        ? DecorationImage(
                            image: CachedNetworkImageProvider(
                                'https://millerstorm.tech$imageUrl'),
                            fit: BoxFit.cover,
                          )
                        : null,
                  ),
                  child: imageUrl.isEmpty
                      ? Center(
                          child: Text(
                            name.isNotEmpty ? name[0].toUpperCase() : '#',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 14),
                // Group info: name + subtitle
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              name,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF111827),
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (onlyAdminCanChat)
                            const Padding(
                              padding: EdgeInsets.only(left: 6),
                              child: Icon(Icons.lock,
                                  size: 14, color: Color(0xFFCB0002)),
                            ),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          const Icon(Icons.people_outline,
                              size: 13, color: Color(0xFF9CA3AF)),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              subtitle,
                              style: const TextStyle(
                                  fontSize: 13, color: Color(0xFF6B7280)),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                // Badges (mention / unread) or chevron
                Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (mentionCount > 0)
                      Container(
                        margin: const EdgeInsets.only(bottom: 4),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFFCB0002),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '@${mentionCount > 99 ? '99+' : mentionCount}',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                    if (unreadCount > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 3),
                        constraints: const BoxConstraints(minWidth: 22),
                        decoration: BoxDecoration(
                          color: const Color(0xFFCB0002),
                          borderRadius: BorderRadius.circular(11),
                        ),
                        child: Text(
                          unreadCount > 99 ? '99+' : unreadCount.toString(),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                    if (mentionCount == 0 && unreadCount == 0)
                      const Icon(Icons.chevron_right,
                          color: Color(0xFFD1D5DB), size: 22),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: const Border(top: BorderSide(color: Color(0xFFD1D5DB), width: 1)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _navItem(context, Icons.school_outlined, 'Training', false, '/courses'),
              const SizedBox(width: 2),
              _navItemActive(Icons.chat_bubble_outline, 'StormChat'),
              const SizedBox(width: 2),
              _navItem(context, Icons.apps_outlined, 'Apps & Tools', false, '/apps-tools-items'),
              const SizedBox(width: 2),
              _navItem(context, Icons.person_outline, 'Profile', false, '/profile'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItem(BuildContext context, IconData icon, String label, bool active, String? route) {
    return Expanded(
      child: GestureDetector(
        onTap: route != null ? () => Navigator.pushReplacementNamed(context, route) : null,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                color: const Color(0xFF9CA3AF),
                size: 24,
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 10,
                  color: Color(0xFF9CA3AF),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItemActive(IconData icon, String label) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0xFFCB0002).withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: const Color(0xFFCB0002), size: 24),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(
                fontSize: 10,
                color: Color(0xFFCB0002),
                fontWeight: FontWeight.w600,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
