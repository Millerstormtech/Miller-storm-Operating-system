import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'ai_clone_chat_screen.dart';

class TrainingScreen extends StatefulWidget {
  const TrainingScreen({super.key});

  @override
  State<TrainingScreen> createState() => _TrainingScreenState();
}

class _TrainingScreenState extends State<TrainingScreen> {
  // Miller Storm Red Theme
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002); // Miller Storm Red
  static const _textDark = Color(0xFF111827);
  static const _textMedium = Color(0xFF374151);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFD1D5DB);
  static const _link = Color(0xFFCB0002); // Miller Storm Red

  String _greeting = 'Good Morning';
  String _userName = 'Loading...';
  String _userHeadshotUrl = '';
  int _stormChatGroupCount = 0;
  String? _userId;
  List<dynamic> _bots = [];
  bool _loadingBots = false;

  @override
  void initState() {
    super.initState();
    _loadUserData();
    _setGreeting();
    _fetchStormChatGroups();
    _fetchBots();
  }

  void _setGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) {
      _greeting = 'Good Morning';
    } else if (hour < 17) {
      _greeting = 'Good Afternoon';
    } else {
      _greeting = 'Good Evening';
    }
  }

  Future<void> _loadUserData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        setState(() {
          _userName = user['name'] ?? 'User';
          _userId = user['_id'] ?? user['id'];
          _userHeadshotUrl = user['headshotUrl'] ?? '';
        });
        // Fetch groups after user data is loaded
        _fetchStormChatGroups();
      }
    } catch (e) {
      print('Error loading user data: $e');
      setState(() {
        _userName = 'User';
      });
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

  Future<void> _fetchBots() async {
    setState(() {
      _loadingBots = true;
    });

    try {
      final response = await http.get(
        Uri.parse('https://millerstorm.tech/api/ai-bots'),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body) as List;
        setState(() {
          _bots = data;
          _loadingBots = false;
        });
      } else {
        setState(() {
          _loadingBots = false;
        });
      }
    } catch (e) {
      print('Error fetching bots: $e');
      setState(() {
        _loadingBots = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async {
        SystemNavigator.pop();
        return false;
      },
      child: Scaffold(
        backgroundColor: _bg,
        body: SafeArea(
          child: Column(
            children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 16),
                    _buildHeader(),
                    const SizedBox(height: 20),
                    _buildBootcampCard(),
                    const SizedBox(height: 24),
                    _buildAICoaches(),
                    const SizedBox(height: 20),
                    _buildJaysAIClone(),
                    const SizedBox(height: 16),
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
        Row(
          children: [
            GestureDetector(
              onTap: () => Navigator.pushNamed(context, '/profile'),
              child: Stack(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: _border,
                    backgroundImage: _userHeadshotUrl.isNotEmpty
                        ? NetworkImage('https://millerstorm.tech$_userHeadshotUrl')
                        : null,
                    child: _userHeadshotUrl.isEmpty
                        ? const Icon(Icons.person, size: 28, color: _textLight)
                        : null,
                  ),
                  Positioned(
                    bottom: 2,
                    right: 2,
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: Colors.green,
                        shape: BoxShape.circle,
                        border: Border.all(color: _white, width: 1.5),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$_greeting,', style: const TextStyle(fontSize: 13, color: _textLight)),
                Text(_userName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _textDark)),
              ],
            ),
          ],
        ),
        Stack(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: _white,
                shape: BoxShape.circle,
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 8)],
              ),
              child: const Icon(Icons.notifications_outlined, color: _textMedium, size: 22),
            ),
            Positioned(
              top: 6,
              right: 6,
              child: Container(
                width: 9,
                height: 9,
                decoration: const BoxDecoration(color: Color(0xFFCB0002), shape: BoxShape.circle),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildBootcampCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: _primary,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -10,
            top: -10,
            child: Icon(Icons.bolt, size: 120, color: _white.withOpacity(0.08)),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'COMING SOON',
                  style: TextStyle(color: _white, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5),
                ),
              ),
              const SizedBox(height: 8),
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('7-Day Bootcamp', style: TextStyle(color: _white, fontSize: 24, fontWeight: FontWeight.w800)),
                  SizedBox(height: 4),
                  Text('Intensive training program launching soon', style: TextStyle(color: Color(0xCCFFFFFF), fontSize: 13)),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                height: 48,
                decoration: BoxDecoration(
                  color: _white.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Center(
                  child: Text(
                    'Coming Soon',
                    style: TextStyle(color: _white, fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAICoaches() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.school_outlined, color: _link, size: 22),
            const SizedBox(width: 8),
            const Text('Courses', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _textDark)),
          ],
        ),
        const SizedBox(height: 12),
        _buildCoachCard(
          icon: Icons.school_outlined,
          iconBg: Color(0xFFEFF6FF),
          iconColor: _link,
          title: 'Miller Storm Training Center',
          subtitle: 'Courses',
          onTap: () => Navigator.pushNamed(context, '/courses'),
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            const Icon(Icons.apps_outlined, color: _link, size: 22),
            const SizedBox(width: 8),
            const Text('Apps & Tools', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _textDark)),
          ],
        ),
        const SizedBox(height: 12),
        _buildCoachCard(
          icon: Icons.apps_outlined,
          iconBg: Color(0xFFF0FDF4),
          iconColor: Color(0xFF16A34A),
          title: 'Apps & Tools',
          subtitle: 'Utilities',
          onTap: () => Navigator.pushNamed(context, '/apps-tools-items'),
        ),
      ],
    );
  }

  Widget _buildJaysAIClone() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.smart_toy_outlined, color: _link, size: 22),
            const SizedBox(width: 8),
            const Text('AI Assistants', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _textDark)),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: _white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
          ),
          child: _loadingBots
              ? const Center(
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: CircularProgressIndicator(color: _primary),
                  ),
                )
              : _bots.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          children: [
                            Icon(Icons.smart_toy_outlined, size: 48, color: _textLight.withOpacity(0.5)),
                            const SizedBox(height: 12),
                            const Text(
                              'No AI assistants available',
                              style: TextStyle(fontSize: 14, color: _textLight),
                            ),
                          ],
                        ),
                      ),
                    )
                  : Column(
                      children: _bots.asMap().entries.map((entry) {
                        final index = entry.key;
                        final bot = entry.value;
                        return Column(
                          children: [
                            if (index > 0)
                              Container(
                                height: 1,
                                margin: const EdgeInsets.symmetric(vertical: 12),
                                color: const Color(0xFFF3F4F6),
                              ),
                            _buildBotListItem(bot),
                          ],
                        );
                      }).toList(),
                    ),
        ),
      ],
    );
  }

  Widget _buildBotListItem(dynamic bot) {
    final name = bot['name'] ?? 'Unknown Bot';
    final description = bot['description'] ?? '';
    final imageUrl = bot['imageUrl'] ?? '';

    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => AiCloneChatScreen(bot: bot),
          ),
        );
      },
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: const Color(0xFFFEF2F2),
              borderRadius: BorderRadius.circular(12),
              image: imageUrl.isNotEmpty
                  ? DecorationImage(
                      image: NetworkImage('https://millerstorm.tech$imageUrl'),
                      fit: BoxFit.cover,
                    )
                  : null,
            ),
            child: imageUrl.isEmpty
                ? const Icon(
                    Icons.smart_toy,
                    size: 24,
                    color: _link,
                  )
                : null,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: _textDark,
                  ),
                ),
                if (description.isNotEmpty) const SizedBox(height: 3),
                if (description.isNotEmpty)
                  Text(
                    description,
                    style: const TextStyle(
                      fontSize: 13,
                      color: _textLight,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: const Color(0xFFF3F4F6),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.arrow_forward_ios, color: _textLight, size: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildCoachCard({
    required IconData icon,
    required Color iconBg,
    required Color iconColor,
    required String title,
    required String subtitle,
    VoidCallback? onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: _white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
        ),
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: iconColor, size: 28),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _textDark)),
                  const SizedBox(height: 4),
                  Text(subtitle, style: const TextStyle(fontSize: 14, color: _textLight)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: _textPlaceholder, size: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildPlaybooks() {
    final playbooks = [
      {'title': 'AccuLynx Workflows', 'subtitle': 'Updated 2 days ago', 'icon': Icons.description_outlined},
      {'title': 'Post-Storm Inspection Guide', 'subtitle': 'Updated last week', 'icon': Icons.camera_outlined},
      {'title': 'Closing the Adjuster', 'subtitle': 'Updated 1 month ago', 'icon': Icons.handshake_outlined},
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                const Icon(Icons.menu_book_outlined, color: _textDark, size: 22),
                const SizedBox(width: 8),
                const Text('Standard Playbooks', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _textDark)),
              ],
            ),
            const Text('View All', style: TextStyle(fontSize: 13, color: _link, fontWeight: FontWeight.w600)),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          decoration: BoxDecoration(
            color: _white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
          ),
          child: Column(
            children: playbooks.asMap().entries.map((entry) {
              final i = entry.key;
              final p = entry.value;
              return Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    child: Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: _bg,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(p['icon'] as IconData, size: 20, color: _textLight),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(p['title'] as String, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: _textDark)),
                              Text(p['subtitle'] as String, style: const TextStyle(fontSize: 12, color: _textLight)),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right, color: _textPlaceholder, size: 20),
                      ],
                    ),
                  ),
                  if (i < playbooks.length - 1)
                    const Divider(height: 1, indent: 68, color: _bg),
                ],
              );
            }).toList(),
          ),
        ),
      ],
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
              _navItem(Icons.school_outlined, 'Training', true, '/courses', context),
              _navItemWithBadge(Icons.chat_bubble_outline, 'StormChat', _stormChatGroupCount, context),
              _navItem(Icons.apps_outlined, 'Apps & Tools', false, '/apps-tools-items', context),
              _navItem(Icons.person_outline, 'Profile', false, '/profile', context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItem(IconData icon, String label, bool active, String? route, BuildContext context) {
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

  Widget _navItemWithBadge(IconData icon, String label, int badge, BuildContext context) {
    return Flexible(
      child: GestureDetector(
        onTap: () => Navigator.pushReplacementNamed(context, '/stormchat'),
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
