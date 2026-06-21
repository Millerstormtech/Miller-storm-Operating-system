import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;

class RankingsScreen extends StatefulWidget {
  const RankingsScreen({super.key});

  @override
  State<RankingsScreen> createState() => _RankingsScreenState();
}

class _RankingsScreenState extends State<RankingsScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFD1D5DB);
  static const _link = Color(0xFFCB0002);

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
        _userId = user['_id'] ?? user['id'];
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
        
        // Filter groups where user is a member
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

  static const _avatarColors = [
    Color(0xFF3B82F6),
    Color(0xFFEC4899),
    Color(0xFF10B981),
    Color(0xFFF59E0B),
    Color(0xFF8B5CF6),
  ];
  static const _avatarInitials = ['JD', 'MS', 'MC', 'AY', 'JT'];

  static const _reps = [
    {'rank': 1, 'name': 'John Davis', 'location': 'Dallas', 'insp': 42, 'claim': 18, 'rev': '\$82K', 'isYou': false, 'trend': 0},
    {'rank': 2, 'name': 'Maria Silva', 'location': 'Dallas', 'insp': 38, 'claim': 14, 'rev': '\$64K', 'isYou': false, 'trend': 0},
    {'rank': 3, 'name': 'Michael Chen', 'location': 'Austin', 'insp': 35, 'claim': 12, 'rev': '\$59K', 'isYou': false, 'trend': 0},
    {'rank': 4, 'name': 'Alex (You)', 'location': 'Dallas', 'insp': 33, 'claim': 15, 'rev': '\$61K', 'isYou': true, 'trend': 1},
    {'rank': 5, 'name': 'Jessica T.', 'location': 'Dallas', 'insp': 28, 'claim': 9, 'rev': '\$42K', 'isYou': false, 'trend': -1},
  ];

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async {
        Navigator.pushReplacementNamed(context, '/training');
        return false;
      },
      child: Scaffold(
        backgroundColor: _bg,
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.emoji_events_outlined,
                        size: 100,
                        color: _textLight.withOpacity(0.3),
                      ),
                      const SizedBox(height: 24),
                      const Text(
                        'Coming Soon',
                        style: TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.w800,
                          color: _textDark,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 48),
                        child: Text(
                          'Rankings feature is under development',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 16,
                            color: _textLight,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              _buildBottomNav(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        const Text('Rankings', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: _textDark)),
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: _white,
            shape: BoxShape.circle,
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 8)],
          ),
          child: const Icon(Icons.tune, color: _textLight, size: 20),
        ),
      ],
    );
  }

  Widget _buildFilterRow() {
    return Row(
      children: [
        _chip('All Reps', filled: true),
        const SizedBox(width: 8),
        _chip('Dallas Branch'),
        const SizedBox(width: 8),
        _chipDropdown('This Month'),
      ],
    );
  }

  Widget _chip(String label, {bool filled = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: filled ? _textDark : _white,
        borderRadius: BorderRadius.circular(24),
        border: filled ? null : Border.all(color: _border),
      ),
      child: Text(label, style: TextStyle(color: filled ? _white : _textDark, fontSize: 13, fontWeight: FontWeight.w600)),
    );
  }

  Widget _chipDropdown(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: _border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: const TextStyle(color: _textDark, fontSize: 13, fontWeight: FontWeight.w500)),
          const SizedBox(width: 2),
          const Icon(Icons.keyboard_arrow_down, size: 16, color: _textDark),
        ],
      ),
    );
  }

  Widget _buildStatusCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFCB0002), Color(0xFFA00002)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -10,
            top: -10,
            child: Icon(Icons.rocket_launch_outlined, size: 100, color: Colors.white.withOpacity(0.1)),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('YOUR STATUS', style: TextStyle(color: Color(0xAAFFFFFF), fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1)),
              const SizedBox(height: 6),
              const Text("You're 2 Inspections behind #3",
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: _white, fontSize: 15, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              const Text("Push hard! Just one solid neighborhood away from Bronze.",
                style: TextStyle(color: Color(0xCCFFFFFF), fontSize: 13),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: LinearProgressIndicator(
                        value: 0.75,
                        minHeight: 8,
                        backgroundColor: Colors.white.withOpacity(0.2),
                        valueColor: const AlwaysStoppedAnimation<Color>(_white),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Text('2 to go', style: TextStyle(color: _white, fontSize: 13, fontWeight: FontWeight.w600)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLeaderboard() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: const [
            Text('TOP INSPECTORS', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: _textDark, letterSpacing: 0.5)),
            Text('Sorted by: Inspections', style: TextStyle(fontSize: 12, color: _textLight)),
          ],
        ),
        const SizedBox(height: 10),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            children: const [
              SizedBox(width: 36, child: Text('RNK', style: TextStyle(fontSize: 11, color: _textPlaceholder, fontWeight: FontWeight.w600))),
              SizedBox(width: 12),
              Expanded(child: Text('REP NAME', style: TextStyle(fontSize: 11, color: _textPlaceholder, fontWeight: FontWeight.w600))),
              SizedBox(width: 60, child: Text('INSP', textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: _textPlaceholder, fontWeight: FontWeight.w600))),
              SizedBox(width: 48, child: Text('CLAIM', textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: _textPlaceholder, fontWeight: FontWeight.w600))),
              SizedBox(width: 60, child: Text('REV', textAlign: TextAlign.right, style: TextStyle(fontSize: 11, color: _textPlaceholder, fontWeight: FontWeight.w600))),
            ],
          ),
        ),
        const SizedBox(height: 8),
        ..._reps.map((rep) => _buildRepRow(rep)).toList(),
      ],
    );
  }

  Widget _buildRepRow(Map<String, dynamic> rep) {
    final int rank = rep['rank'] as int;
    final bool isYou = rep['isYou'] as bool;
    final int trend = rep['trend'] as int;

    Color leftBorderColor = Colors.transparent;
    Widget rankWidget;

    if (rank == 1) {
      leftBorderColor = const Color(0xFFF59E0B);
      rankWidget = const Icon(Icons.workspace_premium, color: Color(0xFFF59E0B), size: 26);
    } else if (rank == 2) {
      leftBorderColor = const Color(0xFF9CA3AF);
      rankWidget = const Icon(Icons.workspace_premium, color: Color(0xFF9CA3AF), size: 26);
    } else if (rank == 3) {
      leftBorderColor = const Color(0xFFCD7F32);
      rankWidget = const Icon(Icons.workspace_premium, color: Color(0xFFCD7F32), size: 26);
    } else {
      leftBorderColor = isYou ? _primary : Colors.transparent;
      rankWidget = Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('#$rank', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: isYou ? _primary : _textDark)),
          if (trend != 0)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(trend > 0 ? Icons.arrow_upward : Icons.arrow_downward, size: 10, color: trend > 0 ? Colors.green : Colors.red),
                Text('1', style: TextStyle(fontSize: 9, color: trend > 0 ? Colors.green : Colors.red)),
              ],
            ),
        ],
      );
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: isYou ? const Color(0xFFEFF6FF) : _white,
        borderRadius: BorderRadius.circular(14),
        border: isYou ? Border.all(color: _primary, width: 1.5) : Border.all(color: Colors.transparent),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6)],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: IntrinsicHeight(
          child: Row(
            children: [
              Container(width: 4, color: leftBorderColor),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
                child: SizedBox(width: 32, child: Center(child: rankWidget)),
              ),
              CircleAvatar(
                radius: 22,
                backgroundColor: _avatarColors[rank - 1],
                child: Text(
                  _avatarInitials[rank - 1],
                  style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(rep['name'] as String, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: isYou ? _primary : _textDark)),
                    Text(rep['location'] as String, style: const TextStyle(fontSize: 12, color: _textLight)),
                  ],
                ),
              ),
              SizedBox(width: 60, child: Text('${rep['insp']}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _textDark))),
              SizedBox(width: 48, child: Text('${rep['claim']}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, color: _textLight))),
              SizedBox(width: 60, child: Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Text(rep['rev'] as String, textAlign: TextAlign.right, maxLines: 1,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _textDark)),
              )),
            ],
          ),
        ),
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
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _navItem(context, Icons.school_outlined, 'Training', false, '/training'),
              _navItem(context, Icons.emoji_events_outlined, 'Rankings', true, null),
              _navItem(context, Icons.work_outline, 'Planner', false, '/planner'),
              _navItemWithBadge(context, Icons.chat_bubble_outline, 'StormChat', _stormChatGroupCount, '/stormchat'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItem(BuildContext context, IconData icon, String label, bool active, String? route) {
    return Flexible(
      child: GestureDetector(
        onTap: route != null ? () => Navigator.pushReplacementNamed(context, route) : null,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: active ? _link : _textPlaceholder, size: 24),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  color: active ? _link : _textPlaceholder,
                  fontWeight: active ? FontWeight.w600 : FontWeight.normal,
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

  Widget _navItemWithBadge(BuildContext context, IconData icon, String label, int badge, String route) {
    return Flexible(
      child: GestureDetector(
        onTap: () => Navigator.pushReplacementNamed(context, route),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
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
}
