import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../widgets/notification_bell.dart';
import 'storm_chat_room_screen.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';

class ManagerStormChatScreen extends StatefulWidget {
  const ManagerStormChatScreen({Key? key}) : super(key: key);

  @override
  _ManagerStormChatScreenState createState() => _ManagerStormChatScreenState();
}

class _ManagerStormChatScreenState extends State<ManagerStormChatScreen> {
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
        userId = user['_id'] ?? user['id'];
        userRole = user['role'];
      });
      await _fetchGroups();
    }
  }

  Future<void> _fetchGroups() async {
    try {
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/storm-chat/groups'),
      );

      if (response.statusCode == 200) {
        final allGroups = json.decode(response.body) as List;
        
        final userGroups = allGroups.where((group) {
          final members = List<String>.from(group['members'] ?? []);
          return members.contains(userId);
        }).toList();

        setState(() {
          groups = userGroups;
          isLoading = false;
        });
        
        await _fetchUnreadCounts();
      } else {
        setState(() {
          isLoading = false;
        });
      }
    } catch (e) {
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
        Navigator.pushReplacementNamed(context, '/manager-training');
        return false;
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF5F5F5),
        body: SafeArea(
        child: Column(
          children: [
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
            Expanded(
              child: isLoading
                  ? const Center(child: CircularProgressIndicator(color: Color(0xFFCB0002)))
                  : groups.isEmpty
                      ? _buildEmptyState()
                      : _buildGroupsList(),
            ),
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
        children: const [
          Icon(Icons.chat_bubble_outline, size: 80, color: Colors.grey),
          SizedBox(height: 16),
          Text('No groups yet', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.black87)),
          SizedBox(height: 8),
          Text('You haven\'t been added to any groups', style: TextStyle(fontSize: 14, color: Colors.grey)),
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
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: groups.length,
        itemBuilder: (context, index) {
          final group = groups[index];
          return _buildGroupCard(group);
        },
      ),
    );
  }

  Widget _buildGroupCard(dynamic group) {
    final name = group['name'] ?? 'Unnamed Group';
    final description = group['description'] ?? '';
    final imageUrl = group['imageUrl'] ?? '';
    final memberCount = (group['members'] as List?)?.length ?? 0;
    final onlyAdminCanChat = group['onlyAdminCanChat'] ?? false;
    final groupId = group['_id'];
    final unreadCount = unreadCounts[groupId] ?? 0;
    final mentionCount = mentionCounts[groupId] ?? 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
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
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: Colors.black,
                    borderRadius: BorderRadius.circular(10),
                    image: imageUrl.isNotEmpty
                        ? DecorationImage(image: NetworkImage('https://millerstorm.tech$imageUrl'), fit: BoxFit.cover)
                        : null,
                  ),
                  child: imageUrl.isEmpty ? const Center(child: Text('👥', style: TextStyle(fontSize: 24))) : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.black87), maxLines: 1, overflow: TextOverflow.ellipsis),
                          ),
                          if (onlyAdminCanChat)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(6)),
                              child: const Text('🔒 Admin', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFFCB0002))),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                // Badges
                Row(
                  children: [
                    if (mentionCount > 0)
                      Container(
                        margin: const EdgeInsets.only(right: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFCB0002),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '@${mentionCount > 99 ? '99+' : mentionCount}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    if (unreadCount > 0)
                      Container(
                        margin: const EdgeInsets.only(right: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFCB0002),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          unreadCount > 99 ? '99+' : unreadCount.toString(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
                const Icon(Icons.chevron_right, color: Colors.grey),
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
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _navItem(context, Icons.school_outlined, 'Training', false, '/manager-training'),
              const SizedBox(width: 2),
              _navItemActive(Icons.chat_bubble_outline, 'StormChat'),
              const SizedBox(width: 2),
              _navItem(context, Icons.apps_outlined, 'Apps & Tools', false, '/manager-apps-tools-items'),
              const SizedBox(width: 2),
              _navItem(context, Icons.group_outlined, 'View Team', false, '/manager-view-team'),
              const SizedBox(width: 2),
              _navItem(context, Icons.person_outline, 'Profile', false, '/manager-profile'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItem(BuildContext context, IconData icon, String label, bool active, String? route) {
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: route != null ? () => Navigator.pushReplacementNamed(context, route) : null,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          color: Colors.transparent,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: const Color(0xFF9CA3AF), size: 24),
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
