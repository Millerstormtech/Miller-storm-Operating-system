import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/api_client.dart';
import 'storm_chat_room_screen.dart';

/// Shows the user's "communities" — groups that contain subgroups — with each
/// community's subgroups listed underneath. A community IS a group with
/// subgroups; its subgroups are the actual chats. Opened from the "Community"
/// button in StormChat.
class StormCommunitiesScreen extends StatefulWidget {
  final String userId;
  final String userRole;

  const StormCommunitiesScreen({super.key, required this.userId, required this.userRole});

  @override
  State<StormCommunitiesScreen> createState() => _StormCommunitiesScreenState();
}

class _StormCommunitiesScreenState extends State<StormCommunitiesScreen> {
  static const _primary = Color(0xFFCB0002);
  List<dynamic> _groups = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetchGroups();
  }

  Future<void> _fetchGroups() async {
    try {
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/storm-chat/groups'),
      );
      if (response.statusCode == 200) {
        final all = json.decode(response.body) as List;
        final mine = all.where((g) {
          final members = List<String>.from(g['members'] ?? []);
          return members.contains(widget.userId);
        }).toList();
        if (mounted) setState(() { _groups = mine; _loading = false; });
      } else {
        if (mounted) setState(() => _loading = false);
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  // Subgroups = the actual chats inside communities. We show ONLY these (no
  // parent/community name) — a group in the user's list whose parentGroupId
  // points to another group that's also in the list.
  List<dynamic> _subgroups() {
    final ids = { for (final g in _groups) g['_id'].toString() };
    return _groups.where((g) {
      final pid = (g['parentGroupId'] ?? '').toString();
      return pid.isNotEmpty && ids.contains(pid);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final subs = _subgroups();
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0.5,
        foregroundColor: const Color(0xFF111827),
        title: const Text('Communities', style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF111827))),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : subs.isEmpty
              ? _emptyState()
              : RefreshIndicator(
                  color: _primary,
                  onRefresh: () async { setState(() => _loading = true); await _fetchGroups(); },
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: subs.length,
                    itemBuilder: (context, i) => _subgroupTile(subs[i]),
                  ),
                ),
    );
  }

  Widget _emptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: const [
          Icon(Icons.groups_2_outlined, size: 80, color: Colors.grey),
          SizedBox(height: 16),
          Text('No communities yet', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.black87)),
          SizedBox(height: 8),
          Text("You haven't been added to any community", style: TextStyle(fontSize: 14, color: Colors.grey)),
        ],
      ),
    );
  }

  // A single subgroup shown as its own card (no parent/community name).
  Widget _subgroupTile(dynamic sub) {
    final name = sub['name'] ?? 'Chat';
    final imageUrl = (sub['imageUrl'] ?? '').toString();
    final memberCount = (sub['members'] as List?)?.length ?? 0;
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
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => StormChatRoomScreen(
                  group: sub,
                  userId: widget.userId,
                  userRole: widget.userRole,
                ),
              ),
            );
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
            child: Row(
              children: [
                _avatar(name, imageUrl, 44),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827)), overflow: TextOverflow.ellipsis),
                      Text('$memberCount member${memberCount == 1 ? '' : 's'}', style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: Color(0xFFBDBDBD)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _avatar(String name, String imageUrl, double size) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: imageUrl.isEmpty
            ? const LinearGradient(colors: [Color(0xFFCB0002), Color(0xFF7F0001)], begin: Alignment.topLeft, end: Alignment.bottomRight)
            : null,
        image: imageUrl.isNotEmpty
            ? DecorationImage(image: CachedNetworkImageProvider('https://millerstorm.tech$imageUrl'), fit: BoxFit.cover)
            : null,
      ),
      child: imageUrl.isEmpty
          ? Center(child: Text(name.isNotEmpty ? name[0].toUpperCase() : '#', style: TextStyle(color: Colors.white, fontSize: size * 0.4, fontWeight: FontWeight.bold)))
          : null,
    );
  }
}
