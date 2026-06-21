import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;

class ManagerRankingsScreen extends StatefulWidget {
  const ManagerRankingsScreen({super.key});

  @override
  State<ManagerRankingsScreen> createState() => _ManagerRankingsScreenState();
}

class _ManagerRankingsScreenState extends State<ManagerRankingsScreen> {
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
        Navigator.pushReplacementNamed(context, '/manager-dashboard');
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
    return const Text(
      'Leaderboards',
      style: TextStyle(
        fontSize: 26,
        fontWeight: FontWeight.bold,
        color: _textDark,
      ),
    );
  }

  Widget _buildFilterTabs() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _buildTab('Global Team', true),
          const SizedBox(width: 12),
          _buildTab('My Branch', false),
          const SizedBox(width: 12),
          _buildTab('New Hires', false),
        ],
      ),
    );
  }

  Widget _buildTab(String label, bool isActive) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: isActive ? Colors.black : Color(0xFFF0F0F0),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: isActive ? _white : _textLight,
        ),
      ),
    );
  }

  Widget _buildMetricsRow() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          'METRICS: REVENUE',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: _textLight,
            letterSpacing: 1.2,
          ),
        ),
        Row(
          children: [
            Text(
              'Monthly',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: _primary,
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.keyboard_arrow_down, color: _primary, size: 20),
          ],
        ),
      ],
    );
  }

  Widget _buildTopThree() {
    return Container(
      color: Colors.black,
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          _buildPodiumPerson(2, 'E. Davis', '\$192k', Colors.grey[400]!),
          const SizedBox(width: 14),
          _buildPodiumPerson(1, 'M. Roberts', '\$245k', _primary, isWinner: true),
          const SizedBox(width: 14),
          _buildPodiumPerson(3, 'S. Jenkins', '\$185k', Color(0xFFCD7F32)),
        ],
      ),
    );
  }

  Widget _buildPodiumPerson(int rank, String name, String amount, Color badgeColor, {bool isWinner = false}) {
    return Column(
      children: [
        if (isWinner)
          Icon(Icons.emoji_events, color: _primary, size: 28),
        if (isWinner)
          const SizedBox(height: 4),
        Stack(
          children: [
            Container(
              width: isWinner ? 65 : 52,
              height: isWinner ? 65 : 52,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isWinner ? _primary : badgeColor,
                  width: 2.5,
                ),
              ),
              child: CircleAvatar(
                backgroundColor: Colors.grey[700],
                child: Icon(Icons.person, color: _white, size: isWinner ? 28 : 22),
              ),
            ),
            Positioned(
              bottom: 0,
              right: 0,
              child: Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  color: badgeColor,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.black, width: 2),
                ),
                child: Center(
                  child: Text(
                    '$rank',
                    style: TextStyle(
                      color: _white,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          name,
          style: TextStyle(
            color: _white,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          amount,
          style: TextStyle(
            color: isWinner ? _primary : _white,
            fontSize: isWinner ? 18 : 14,
            fontWeight: FontWeight.bold,
          ),
        ),
      ],
    );
  }

  Widget _buildLeaderboard() {
    final leaderboard = [
      {'rank': 4, 'name': 'Marcus Chen', 'branch': 'West Coast Branch', 'amount': '\$170k', 'change': '↑ 2 spots', 'changeColor': Colors.green},
      {'rank': 5, 'name': 'Amanda Jones', 'branch': 'Southern Branch', 'amount': '\$162k', 'change': null},
      {'rank': 6, 'name': 'Jessica Liu', 'branch': 'East Coast Branch', 'amount': '\$158k', 'change': '↓ 1 spot', 'changeColor': Colors.red},
      {'rank': 7, 'name': 'Alex Manager', 'branch': '\$4k to next rank', 'amount': '\$154k', 'isYou': true},
    ];

    return Column(
      children: leaderboard.map((person) => _buildLeaderboardRow(person)).toList(),
    );
  }

  Widget _buildLeaderboardRow(Map<String, dynamic> person) {
    final isYou = person['isYou'] ?? false;
    
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(14),
        border: isYou ? Border.all(color: _primary, width: 2) : null,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Text(
            '${person['rank']}',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: _textLight,
            ),
          ),
          const SizedBox(width: 14),
          CircleAvatar(
            radius: 24,
            backgroundColor: _border,
            child: person['rank'] == 5
                ? Text(
                    'AJ',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: _textLight,
                    ),
                  )
                : Icon(Icons.person, color: _textLight, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      person['name'],
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: _textDark,
                      ),
                    ),
                    if (isYou)
                      const SizedBox(width: 6),
                    if (isYou)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: _primary,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          'YOU',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                            color: _white,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  person['branch'],
                  style: TextStyle(
                    fontSize: 13,
                    color: isYou ? _primary : _textLight,
                    fontWeight: isYou ? FontWeight.w600 : FontWeight.normal,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                person['amount'],
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: isYou ? _primary : _textDark,
                ),
              ),
              if (person['change'] != null)
                const SizedBox(height: 3),
              if (person['change'] != null)
                Text(
                  person['change'],
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: person['changeColor'],
                  ),
                ),
            ],
          ),
        ],
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
              _navItem(context, Icons.school_outlined, 'Training', false, '/manager-training'),
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
              Icon(icon, color: active ? _link : _textPlaceholder, size: 24),
              const SizedBox(height: 4),
              Text(label, style: TextStyle(fontSize: 11, color: active ? _link : _textPlaceholder, fontWeight: active ? FontWeight.w600 : FontWeight.normal), textAlign: TextAlign.center),
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
        decoration: BoxDecoration(color: _link.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: _link, size: 24),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 11, color: _link, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
