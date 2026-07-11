import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/auth_service.dart';
import '../widgets/notification_bell.dart';
import 'storm_chat_room_screen.dart';
import 'storm_communities_screen.dart';
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
      // ?mine=1 → only this user's groups AND their private DMs.
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/storm-chat/groups?mine=1'),
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'StormChat',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF111827),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      _newMessageButton(),
                      const SizedBox(width: 10),
                      _communityButton(),
                    ],
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

  Widget _communityButton() {
    final count = _communityCount();
    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => StormCommunitiesScreen(userId: userId ?? '', userRole: userRole ?? ''),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: const Color(0xFF1F2937),
          borderRadius: BorderRadius.circular(22),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.groups_2_rounded, color: Colors.white, size: 18),
            const SizedBox(width: 7),
            const Text('Communities', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
            if (count > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(color: const Color(0xFFCB0002), borderRadius: BorderRadius.circular(10)),
                child: Text('$count', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // "Normal" groups only: not a community (has no subgroups) and not itself a
  // subgroup of a visible community.
  List<dynamic> _regularGroups() {
    final byId = { for (final g in groups) g['_id'].toString(): g };
    final parentIds = <String>{};
    for (final g in groups) {
      final pid = (g['parentGroupId'] ?? '').toString();
      if (pid.isNotEmpty) parentIds.add(pid);
    }
    return groups.where((g) {
      if (g['isDirect'] == true) return false; // DMs live in their own section
      final id = g['_id'].toString();
      final pid = (g['parentGroupId'] ?? '').toString();
      final isCommunity = parentIds.contains(id);
      final isSubgroup = pid.isNotEmpty && byId.containsKey(pid);
      return !isCommunity && !isSubgroup;
    }).toList();
  }

  // The user's private 1-on-1 direct messages.
  List<dynamic> _directMessages() {
    return groups.where((g) => g['isDirect'] == true).toList();
  }

  int _communityCount() {
    final parentIds = <String>{};
    for (final g in groups) {
      if (g['isDirect'] == true) continue;
      final pid = (g['parentGroupId'] ?? '').toString();
      if (pid.isNotEmpty) parentIds.add(pid);
    }
    return groups.where((g) => parentIds.contains(g['_id'].toString())).length;
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
          // Main list = only "normal" groups: not a community (no subgroups)
          // and not a subgroup itself. Communities + their subgroups live under
          // the "Communities" button in the header.
          final regular = _regularGroups();
          final dms = _directMessages();
          if (regular.isEmpty && dms.isEmpty) return _buildEmptyState();
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (dms.isNotEmpty) ...[
                _sectionLabel('Direct Messages'),
                ...dms.map((d) => _buildDmCard(d)),
                const SizedBox(height: 8),
              ],
              if (regular.isNotEmpty) ...[
                if (dms.isNotEmpty) _sectionLabel('Groups'),
                ...regular.map((g) => _buildGroupCard(g)),
              ],
            ],
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

  Widget _sectionLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 2, left: 4),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.5),
      ),
    );
  }

  // Compose button → opens the "New message" people picker.
  Widget _newMessageButton() {
    return GestureDetector(
      onTap: _showNewMessageSheet,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: const Color(0xFFCB0002),
          borderRadius: BorderRadius.circular(22),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: const [
            Icon(Icons.edit_outlined, color: Colors.white, size: 16),
            SizedBox(width: 6),
            Text('New', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }

  Widget _buildDmCard(dynamic dm) {
    final other = dm['dmOther'] as Map<String, dynamic>?;
    final name = (other?['name'] ?? 'Direct message').toString();
    final imageUrl = (other?['imageUrl'] ?? '').toString();
    final groupId = dm['_id'];
    final unreadCount = unreadCounts[groupId] ?? 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, 3))],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => _openDmRoom(dm),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Container(
                  width: 54,
                  height: 54,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: imageUrl.isEmpty
                        ? const LinearGradient(colors: [Color(0xFF4B5563), Color(0xFF1F2937)], begin: Alignment.topLeft, end: Alignment.bottomRight)
                        : null,
                    image: imageUrl.isNotEmpty
                        ? DecorationImage(image: CachedNetworkImageProvider('https://millerstorm.tech$imageUrl'), fit: BoxFit.cover)
                        : null,
                  ),
                  child: imageUrl.isEmpty
                      ? Center(child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)))
                      : null,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827)), maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 3),
                      const Text('Private message', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                if (unreadCount > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    constraints: const BoxConstraints(minWidth: 22),
                    decoration: BoxDecoration(color: const Color(0xFFCB0002), borderRadius: BorderRadius.circular(11)),
                    child: Text(unreadCount > 99 ? '99+' : unreadCount.toString(), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                  )
                else
                  const Icon(Icons.chevron_right, color: Color(0xFFD1D5DB), size: 22),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openDmRoom(dynamic dm) async {
    final other = dm['dmOther'] as Map<String, dynamic>?;
    final name = (other?['name'] ?? 'Direct message').toString();
    final g = Map<String, dynamic>.from(dm as Map);
    g['name'] = name;
    g['isDirect'] = true;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => StormChatRoomScreen(group: g, userId: userId!, userRole: userRole!),
      ),
    );
    await _fetchGroups();
    await _fetchUnreadCounts();
  }

  Future<void> _showNewMessageSheet() async {
    List<dynamic> allUsers = [];
    bool loading = true;
    bool started = false;
    String query = '';

    Future<void> loadUsers(StateSetter setSheet) async {
      try {
        final res = await api.get(Uri.parse('https://millerstorm.tech/api/users/directory'));
        if (res.statusCode == 200) allUsers = json.decode(res.body) as List;
      } catch (_) {}
      setSheet(() => loading = false);
    }

    if (!mounted) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheet) {
            if (!started) {
              started = true;
              loadUsers(setSheet);
            }
            final q = query.trim().toLowerCase();
            final filtered = allUsers.where((u) {
              if ((u['id'] ?? '') == (userId ?? '') || (u['_id'] ?? '') == (userId ?? '')) return false;
              if (q.isEmpty) return true;
              final n = (u['name'] ?? '').toString().toLowerCase();
              final e = (u['email'] ?? '').toString().toLowerCase();
              return n.contains(q) || e.contains(q);
            }).toList();
            return Padding(
              padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
              child: SizedBox(
                height: MediaQuery.of(ctx).size.height * 0.75,
                child: Column(
                  children: [
                    const SizedBox(height: 12),
                    Container(width: 40, height: 4, decoration: BoxDecoration(color: const Color(0xFFE5E7EB), borderRadius: BorderRadius.circular(2))),
                    const Padding(
                      padding: EdgeInsets.fromLTRB(20, 14, 20, 8),
                      child: Align(alignment: Alignment.centerLeft, child: Text('New message', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFF111827)))),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: TextField(
                        autofocus: true,
                        onChanged: (v) => setSheet(() => query = v),
                        decoration: InputDecoration(
                          hintText: 'Search people',
                          prefixIcon: const Icon(Icons.search, size: 20),
                          contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 12),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Expanded(
                      child: loading
                          ? const Center(child: CircularProgressIndicator(color: Color(0xFFCB0002)))
                          : filtered.isEmpty
                              ? const Center(child: Text('No people found', style: TextStyle(color: Color(0xFF9CA3AF))))
                              : ListView.builder(
                                  itemCount: filtered.length,
                                  itemBuilder: (c, i) {
                                    final u = filtered[i];
                                    final name = (u['name'] ?? '').toString();
                                    final role = (u['role'] ?? '').toString();
                                    final img = (u['headshotUrl'] ?? '').toString();
                                    return ListTile(
                                      leading: CircleAvatar(
                                        radius: 20,
                                        backgroundColor: const Color(0xFF4B5563),
                                        backgroundImage: img.isNotEmpty ? CachedNetworkImageProvider('https://millerstorm.tech$img') : null,
                                        child: img.isEmpty ? Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: const TextStyle(color: Colors.white)) : null,
                                      ),
                                      title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
                                      subtitle: Text(role, style: const TextStyle(color: Color(0xFF9CA3AF))),
                                      onTap: () => _startDmWith((u['_id'] ?? u['id']).toString()),
                                    );
                                  },
                                ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _startDmWith(String targetId) async {
    Navigator.pop(context);
    try {
      final res = await api.post(
        Uri.parse('https://millerstorm.tech/api/storm-chat/dm'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'userId': targetId}),
      );
      if (res.statusCode == 200) {
        await _openDmRoom(json.decode(res.body));
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open the conversation')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open the conversation')));
    }
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
              _navItem(context, Icons.leaderboard_outlined, 'Leaderboard', false, '/manager-rankings'),
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
