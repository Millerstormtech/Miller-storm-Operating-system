import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import '../services/auth_service.dart';
import 'sales_team_lead_courses_screen.dart';
import 'jays_ai_clone_screen.dart';
import 'ai_clone_chat_screen.dart';

class SalesTeamLeadTrainingScreen extends StatefulWidget {
  const SalesTeamLeadTrainingScreen({super.key});

  @override
  State<SalesTeamLeadTrainingScreen> createState() => _SalesTeamLeadTrainingScreenState();
}

class _SalesTeamLeadTrainingScreenState extends State<SalesTeamLeadTrainingScreen> {
  Color get _bg => AppColors.bg;
  Color get _white => AppColors.surface;
  static const _primary = Color(0xFFCB0002);
  Color get _textDark => AppColors.textDark;
  Color get _textLight => AppColors.textLight;
  Color get _textPlaceholder => AppColors.textPlaceholder;
  Color get _border => AppColors.border;

  int _stormChatGroupCount = 0;
  String? _userId;
  String? _headshotUrl;
  String? _userName;
  // Jay's AI Clone avatar (cached) shown on the header icon, plus the bots
  // assigned to this role so the icon can open the chat directly.
  String? _jayAvatarUrl;
  List<dynamic> _jayBots = [];

  @override
  void initState() {
    super.initState();
    _loadUserAndFetchGroups();
    _loadCachedJayAvatar();
    _fetchJayBots();
  }

  // Show the last-known Jay avatar from cache so the header icon isn't a generic
  // robot before the network fetch completes.
  Future<void> _loadCachedJayAvatar() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cached = prefs.getString('jay_avatar_url');
      if (cached != null && cached.isNotEmpty && mounted) {
        setState(() => _jayAvatarUrl = cached);
      }
    } catch (_) {}
  }

  // Fetch the AI bots assigned to this user's role (light payload), so Jay's
  // Clone can open straight into chat when there's a single bot — same as Sales.
  Future<void> _fetchJayBots() async {
    try {
      final user = await AuthService.getStoredUser();
      final role = user?['role']?.toString();
      final res = await api.get(Uri.parse('https://millerstorm.tech/api/ai-bots?light=1'));
      if (res.statusCode != 200) return;
      final data = json.decode(res.body) as List;
      final assigned = data.where((b) {
        final ar = b['assignedRoles'];
        return ar is List && role != null && ar.contains(role);
      }).toList();
      if (!mounted) return;
      String? avatar;
      if (assigned.isNotEmpty) {
        final raw = (assigned.first['botAvatarUrl'] ?? assigned.first['imageUrl'] ?? '').toString();
        if (raw.isNotEmpty) avatar = raw.startsWith('http') ? raw : 'https://millerstorm.tech$raw';
      }
      setState(() {
        _jayBots = assigned;
        if (avatar != null && avatar.isNotEmpty) _jayAvatarUrl = avatar;
      });
      if (avatar != null && avatar.isNotEmpty) {
        try {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('jay_avatar_url', avatar);
        } catch (_) {}
      }
    } catch (_) {}
  }

  // Open Jay's AI Clone: a single bot goes straight into chat (no list screen);
  // multiple bots show the picker; none shows a toast. Matches the Sales panel.
  void _openJaysAi() {
    if (_jayBots.length == 1) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => AiCloneChatScreen(bot: _jayBots.first)));
    } else if (_jayBots.length > 1) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => const JaysAiCloneScreen()));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No AI assistant available yet')),
      );
    }
  }

  Future<void> _loadUserAndFetchGroups() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        setState(() {
          _userId = user['_id'] ?? user['id'];
          _headshotUrl = user['headshotUrl'];
          _userName = user['name'];
        });
        await _fetchStormChatGroups();
      }
    } catch (e) {
      print('Error loading user data: $e');
    }
  }

  Future<void> _fetchStormChatGroups() async {
    if (_userId == null) return;
    
    try {
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/storm-chat/groups'),
      );

      if (response.statusCode == 200) {
        final allGroups = json.decode(response.body) as List;
        
        final userGroups = allGroups.where((group) {
          final members = List<String>.from(group['members'] ?? []);
          return members.contains(_userId);
        }).toList();

        setState(() {
          _stormChatGroupCount = userGroups.length;
        });
      }
    } catch (e) {
      print('Error fetching StormChat groups: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async {
        await SystemNavigator.pop();
        return false;
      },
      child: Scaffold(
        backgroundColor: _bg,
        body: SafeArea(
          child: Column(
            children: [
              Container(
                width: double.infinity,
                color: _white,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Training Center',
                        style: TextStyle(
                          color: _textDark,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    // Jay's AI Clone — same as the clevel / branch manager panels:
                    // avatar when known, otherwise a bot icon; opens the chat.
                    IconButton(
                      icon: (_jayAvatarUrl != null && _jayAvatarUrl!.isNotEmpty)
                          ? Container(
                              width: 30,
                              height: 30,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                image: DecorationImage(
                                  image: NetworkImage(_jayAvatarUrl!),
                                  fit: BoxFit.cover,
                                ),
                              ),
                            )
                          : const Icon(Icons.smart_toy_outlined, color: _primary, size: 28),
                      tooltip: "Jay's AI Clone",
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () {
                        _openJaysAi();
                      },
                    ),
                    const SizedBox(width: 14),
                    IconButton(
                      icon: const Text('🏆', style: TextStyle(fontSize: 26)),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () {
                        Navigator.pushNamed(context, '/manager-training-leaderboard');
                      },
                    ),
                    const SizedBox(width: 14),
                    _buildProfileAvatar(),
                  ],
                ),
              ),
              const Expanded(child: SalesTeamLeadCoursesScreen()),
            ],
          ),
        ),
        bottomNavigationBar: _buildBottomNav(context),
      ),
    );
  }

  // Circular user photo → tap opens the Profile page.
  Widget _buildProfileAvatar() {
    final img = (_headshotUrl ?? '').toString();
    final initial = (_userName ?? '').isNotEmpty ? _userName!.trim()[0].toUpperCase() : '?';
    return GestureDetector(
      onTap: () => Navigator.pushReplacementNamed(context, '/manager-profile'),
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0xFF374151),
          border: Border.all(color: _primary, width: 2),
          image: img.isNotEmpty
              ? DecorationImage(image: NetworkImage('https://millerstorm.tech$img'), fit: BoxFit.cover)
              : null,
        ),
        alignment: Alignment.center,
        child: img.isEmpty
            ? Text(initial, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold))
            : null,
      ),
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _white,
        border: Border(top: BorderSide(color: _border, width: 1)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _navItem(context, Icons.leaderboard_outlined, 'Sales', false, '/manager-rankings'),
              const SizedBox(width: 2),
              _navItem(context, Icons.chat_bubble_outline, 'StormChat', false, '/manager-stormchat'),
              const SizedBox(width: 2),
              _navItem(context, Icons.apps_outlined, 'Tools', false, '/manager-apps-tools-items'),
              const SizedBox(width: 2),
              _navItem(context, Icons.group_outlined, 'View Team', false, '/manager-view-team'),
              const SizedBox(width: 2),
              _navItemActive(Icons.school_outlined, 'Training'),
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
              Icon(icon, color: _textPlaceholder, size: 24),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  color: _textPlaceholder,
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
          color: _primary.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: _primary, size: 24),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(
                fontSize: 10,
                color: _primary,
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
