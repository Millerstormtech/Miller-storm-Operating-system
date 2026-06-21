import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'manager_courses_screen.dart';

class ManagerTrainingScreen extends StatefulWidget {
  const ManagerTrainingScreen({super.key});

  @override
  State<ManagerTrainingScreen> createState() => _ManagerTrainingScreenState();
}

class _ManagerTrainingScreenState extends State<ManagerTrainingScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFD1D5DB);

  int _stormChatGroupCount = 0;
  String? _userId;

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
      final response = await http.get(
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
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Miller Storm Training Center',
                      style: TextStyle(
                        color: _textDark,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    IconButton(
                      icon: const Text('🏆', style: TextStyle(fontSize: 26)),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () {
                        Navigator.pushNamed(context, '/manager-training-leaderboard');
                      },
                    ),
                  ],
                ),
              ),
              const Expanded(child: ManagerCoursesScreen()),
            ],
          ),
        ),
        bottomNavigationBar: _buildBottomNav(context),
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
              _navItemActive(Icons.school_outlined, 'Training'),
              const SizedBox(width: 2),
              _navItem(context, Icons.chat_bubble_outline, 'StormChat', false, '/manager-stormchat'),
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
              Icon(icon, color: _textPlaceholder, size: 24),
              const SizedBox(height: 4),
              Text(
                label,
                style: const TextStyle(
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
