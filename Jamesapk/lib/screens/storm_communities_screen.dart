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

  // Communities = groups (in the user's list) that have at least one subgroup.
  List<Map<String, dynamic>> _communities() {
    final parentIds = <String>{};
    for (final g in _groups) {
      final pid = (g['parentGroupId'] ?? '').toString();
      if (pid.isNotEmpty) parentIds.add(pid);
    }
    final result = <Map<String, dynamic>>[];
    for (final g in _groups) {
      final id = g['_id'].toString();
      if (!parentIds.contains(id)) continue; // not a community
      final subs = _groups.where((s) => (s['parentGroupId'] ?? '').toString() == id).toList();
      result.add({'community': g, 'subs': subs});
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final communities = _communities();
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
          : communities.isEmpty
              ? _emptyState()
              : RefreshIndicator(
                  color: _primary,
                  onRefresh: () async { setState(() => _loading = true); await _fetchGroups(); },
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: communities.length,
                    itemBuilder: (context, i) {
                      final community = communities[i]['community'];
                      final subs = communities[i]['subs'] as List<dynamic>;
                      return _communitySection(community, subs);
                    },
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

  Widget _communitySection(dynamic community, List<dynamic> subs) {
    final name = community['name'] ?? 'Community';
    final imageUrl = (community['imageUrl'] ?? '').toString();
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, 3))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Community header
          Row(
            children: [
              _avatar(name, imageUrl, 44),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827)), overflow: TextOverflow.ellipsis),
                    Text('${subs.length} chat${subs.length == 1 ? '' : 's'}', style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Divider(height: 1),
          const SizedBox(height: 4),
          // Subgroups
          ...subs.map((sub) => _subgroupTile(sub)),
        ],
      ),
    );
  }

  Widget _subgroupTile(dynamic sub) {
    final name = sub['name'] ?? 'Chat';
    final imageUrl = (sub['imageUrl'] ?? '').toString();
    final memberCount = (sub['members'] as List?)?.length ?? 0;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
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
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
          child: Row(
            children: [
              _avatar(name, imageUrl, 40),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF111827)), overflow: TextOverflow.ellipsis),
                    Text('$memberCount member${memberCount == 1 ? '' : 's'}', style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Color(0xFFBDBDBD)),
            ],
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
