import 'package:flutter/material.dart';
import '../widgets/branch_manager_bottom_nav.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import 'branch_manager_courses_screen.dart';
import 'branch_manager_unlock_lesson_screen.dart';

class BranchManagerTrainingScreen extends StatefulWidget {
  const BranchManagerTrainingScreen({super.key});

  @override
  State<BranchManagerTrainingScreen> createState() => _BranchManagerTrainingScreenState();
}

class _BranchManagerTrainingScreenState extends State<BranchManagerTrainingScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFD1D5DB);

  int _stormChatGroupCount = 0;
  String? _userId;
  String? _headshotUrl;
  String? _userName;

  @override
  void initState() {
    super.initState();
    _loadUserAndFetchGroups();
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
                    const Expanded(
                      child: Text(
                        'Miller Storm Training Center',
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
                    IconButton(
                      icon: const Text('🏆', style: TextStyle(fontSize: 32)),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () {
                        Navigator.pushNamed(context, '/bm-training-leaderboard');
                      },
                    ),
                    const SizedBox(width: 8),
                    _buildProfileAvatar(),
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

  // Circular user photo → tap opens the Profile page.
  Widget _buildProfileAvatar() {
    final img = (_headshotUrl ?? '').toString();
    final initial = (_userName ?? '').isNotEmpty ? _userName!.trim()[0].toUpperCase() : '?';
    return GestureDetector(
      onTap: () => Navigator.pushReplacementNamed(context, '/bm-profile'),
      child: Container(
        width: 32,
        height: 32,
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
            ? Text(initial, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold))
            : null,
      ),
    );
  }

}
