import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../services/api_client.dart';
import 'sales_team_lead_courses_screen.dart';
import '../widgets/sales_team_lead_bottom_nav.dart';

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
      onWillPop: () async => true,
      child: Scaffold(
        backgroundColor: _bg,
        drawer: const SalesTeamLeadBottomNav(active: 'training'),
        body: SafeArea(
          child: Column(
            children: [
              Container(
                width: double.infinity,
                color: _white,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                child: Row(
                  children: [
                    Builder(
                      builder: (context) => IconButton(
                        icon: Icon(Icons.menu, color: _textDark),
                        tooltip: 'Menu',
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: () => Scaffold.of(context).openDrawer(),
                      ),
                    ),
                    const SizedBox(width: 8),
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
                    _buildProfileAvatar(),
                  ],
                ),
              ),
              const Expanded(child: SalesTeamLeadCoursesScreen()),
            ],
          ),
        ),
      ),
    );
  }

  // Circular user photo → tap opens the Profile page.
  Widget _buildProfileAvatar() {
    final img = (_headshotUrl ?? '').toString();
    final initial = (_userName ?? '').isNotEmpty ? _userName!.trim()[0].toUpperCase() : '?';
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/manager-profile'),
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

}
