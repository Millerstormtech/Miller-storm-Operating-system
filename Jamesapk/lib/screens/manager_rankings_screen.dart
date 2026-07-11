import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/api_client.dart';

// Sales Leaderboard for managers — same data/functionality as the web manager
// Sales Leaderboard: live from AccuLynx + RepCard via /api/leaderboard, with a
// window toggle (Today / Week / Month / Year), ranked list, and "You" highlight.
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
  static const _green = Color(0xFF16A34A);

  static const List<Map<String, String>> _windows = [
    {'key': 'day', 'label': 'Today'},
    {'key': 'week', 'label': 'Week'},
    {'key': 'month', 'label': 'Month'},
    {'key': 'year', 'label': 'Year'},
  ];

  String _window = 'month';
  List<dynamic> _rows = [];
  bool _loading = true;
  String? _userId; // app id, for the "You" highlight

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        _userId = (user['id'] ?? user['_id'])?.toString();
      }
    } catch (_) {}
    await _fetch();
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    try {
      final res = await api.get(
        Uri.parse('https://millerstorm.tech/api/leaderboard?window=$_window'),
      );
      if (res.statusCode == 200) {
        final data = json.decode(res.body);
        setState(() {
          _rows = (data['leaderboard'] as List?) ?? [];
          _loading = false;
        });
      } else {
        setState(() => _loading = false);
      }
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  String _money(dynamic n) {
    final v = (n is num) ? n : num.tryParse('$n') ?? 0;
    final s = v.round().toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
      buf.write(s[i]);
    }
    return '\$$buf';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            Container(
              width: double.infinity,
              color: _white,
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Sales Leaderboard',
                      style: TextStyle(color: _textDark, fontSize: 22, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 3),
                  const Text('Live from AccuLynx + RepCard · refreshed hourly',
                      style: TextStyle(color: _textLight, fontSize: 12.5)),
                  const SizedBox(height: 14),
                  // Window toggle
                  Row(
                    children: _windows.map((w) {
                      final active = _window == w['key'];
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: GestureDetector(
                          onTap: () { setState(() => _window = w['key']!); _fetch(); },
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: active ? _primary : _white,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: active ? _primary : _border),
                            ),
                            child: Text(w['label']!,
                                style: TextStyle(
                                    color: active ? _white : _textLight,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600)),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator(color: _primary))
                  : _rows.isEmpty
                      ? const Center(
                          child: Text('No data for this period yet.',
                              style: TextStyle(color: _textPlaceholder, fontSize: 14)))
                      : RefreshIndicator(
                          color: _primary,
                          onRefresh: _fetch,
                          child: ListView.builder(
                            padding: const EdgeInsets.all(14),
                            itemCount: _rows.length,
                            itemBuilder: (context, i) => _row(_rows[i], i),
                          ),
                        ),
            ),
            _buildBottomNav(context),
          ],
        ),
      ),
    );
  }

  Widget _row(dynamic r, int index) {
    final rank = (r['rank'] is int) ? r['rank'] : (index + 1);
    final name = (r['name'] ?? 'Unknown Rep').toString();
    final branch = (r['branch'] ?? '').toString();
    final img = (r['headshotUrl'] ?? '').toString();
    final isYou = _userId != null && r['repUserId']?.toString() == _userId;
    final knocks = r['verifiedKnocks'] ?? 0;
    final filed = r['filed'] ?? 0;
    final won = r['won'] ?? 0;

    final medal = rank == 1 ? '🥇' : rank == 2 ? '🥈' : rank == 3 ? '🥉' : null;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: isYou ? const Color(0xFFFFF1F1) : _white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: isYou ? _primary.withOpacity(0.4) : const Color(0xFFEEF0F3)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 3))],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Column(
          children: [
            Row(
              children: [
                // Rank / medal
                SizedBox(
                  width: 34,
                  child: medal != null
                      ? Text(medal, style: const TextStyle(fontSize: 24), textAlign: TextAlign.center)
                      : Text('$rank',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _textLight)),
                ),
                const SizedBox(width: 8),
                // Avatar
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF374151),
                  ),
                  clipBehavior: Clip.antiAlias,
                  alignment: Alignment.center,
                  child: img.isNotEmpty
                      ? CachedNetworkImage(
                          imageUrl: 'https://millerstorm.tech$img',
                          fit: BoxFit.cover, width: 44, height: 44,
                          errorWidget: (_, __, ___) => _initial(name),
                        )
                      : _initial(name),
                ),
                const SizedBox(width: 12),
                // Name + branch
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isYou ? '$name (You)' : name,
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _textDark),
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                      ),
                      if (branch.isNotEmpty)
                        Text(branch, style: const TextStyle(fontSize: 12, color: _textPlaceholder),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                // Contract amount (revenue)
                Text(_money(r['revenue']),
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: _green)),
              ],
            ),
            const SizedBox(height: 10),
            Container(height: 1, color: const Color(0xFFF3F4F6)),
            const SizedBox(height: 8),
            // Metrics row
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _stat('🚪 Knocks', '$knocks'),
                _stat('Claims Filed', '$filed'),
                _stat('Contracts', '$won'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _initial(String name) => Text(
        name.trim().isNotEmpty ? name.trim()[0].toUpperCase() : '?',
        style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
      );

  Widget _stat(String label, String value) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: _textDark)),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(fontSize: 11, color: _textPlaceholder)),
      ],
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _white,
        border: const Border(top: BorderSide(color: _border, width: 1)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _navItem(context, Icons.school_outlined, 'Training', false, '/manager-training'),
              _navItem(context, Icons.chat_bubble_outline, 'StormChat', false, '/manager-stormchat'),
              _navItem(context, Icons.apps_outlined, 'Apps & Tools', false, '/manager-apps-tools-items'),
              _navItem(context, Icons.group_outlined, 'View Team', false, '/manager-view-team'),
              _navItemActive(Icons.leaderboard_outlined, 'Leaderboard'),
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
              Text(label,
                  style: TextStyle(fontSize: 10, color: active ? _link : _textPlaceholder, fontWeight: active ? FontWeight.w600 : FontWeight.normal),
                  maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center),
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
            Text(label,
                style: const TextStyle(fontSize: 10, color: _link, fontWeight: FontWeight.w600),
                maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
