import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/branch_manager_bottom_nav.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import '../services/auth_service.dart';
import 'branch_manager_courses_screen.dart';
import 'branch_manager_unlock_lesson_screen.dart';
import 'jays_ai_clone_screen.dart';
import 'ai_clone_chat_screen.dart';

class BranchManagerTrainingScreen extends StatefulWidget {
  const BranchManagerTrainingScreen({super.key});

  @override
  State<BranchManagerTrainingScreen> createState() => _BranchManagerTrainingScreenState();
}

class _BranchManagerTrainingScreenState extends State<BranchManagerTrainingScreen> {
  Color get _bg => AppColors.bg;
  Color get _white => AppColors.surface;
  static const _primary = Color(0xFFCB0002);
  Color get _textDark => AppColors.textDark;
  Color get _textLight => AppColors.textLight;
  Color get _textPlaceholder => AppColors.textPlaceholder;
  Color get _border => AppColors.border;

  int _stormChatGroupCount = 0;
  String? _userId;
  // Jay's AI Clone avatar (cached by the courses screen), shown on the header icon.
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
  // robot before the user has opened Jay's Clone once.
  Future<void> _loadCachedJayAvatar() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cached = prefs.getString('jay_avatar_url');
      if (cached != null && cached.isNotEmpty && mounted) {
        setState(() => _jayAvatarUrl = cached);
      }
    } catch (_) {}
  }

  Future<void> _loadUserAndFetchGroups() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        setState(() {
          _userId = user['_id'] ?? user['id'];
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
                    IconButton(
                      icon: const Icon(Icons.lock_open, color: _primary, size: 32),
                      tooltip: 'Unlock lessons for a rep',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const BranchManagerUnlockLessonScreen()),
                        );
                      },
                    ),
                    const SizedBox(width: 8),
                    // Jay's AI Clone — same as the Sales panel: avatar when known,
                    // otherwise a bot icon; opens Jay's Clone.
                    IconButton(
                      icon: (_jayAvatarUrl != null && _jayAvatarUrl!.isNotEmpty)
                          ? Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                image: DecorationImage(
                                  image: NetworkImage(_jayAvatarUrl!),
                                  fit: BoxFit.cover,
                                ),
                              ),
                            )
                          : const Icon(Icons.smart_toy_outlined, color: _primary, size: 30),
                      tooltip: "Jayi",
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () {
                        _openJaysAi();
                      },
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      icon: const Text('🏆', style: TextStyle(fontSize: 32)),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () {
                        Navigator.pushNamed(context, '/bm-training-leaderboard');
                      },
                    ),
                  ],
                ),
              ),
              const Expanded(child: BranchManagerCoursesScreen()),
            ],
          ),
        ),
        bottomNavigationBar: BranchManagerBottomNav(active: 'training'),
      ),
    );
  }

}
