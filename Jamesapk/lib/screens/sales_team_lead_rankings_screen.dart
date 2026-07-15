import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/api_client.dart';

// Sales Leaderboard for reps — Period / Branch / Team filters + Custom range,
// live from AccuLynx + RepCard via /api/leaderboard. Self-contained per panel.
class SalesTeamLeadRankingsScreen extends StatefulWidget {
  const SalesTeamLeadRankingsScreen({super.key});

  @override
  State<SalesTeamLeadRankingsScreen> createState() => _SalesTeamLeadRankingsScreenState();
}

class _SalesTeamLeadRankingsScreenState extends State<SalesTeamLeadRankingsScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFD1D5DB);
  static const _green = Color(0xFF16A34A);

  static const List<Map<String, String>> _periods = [
    {'key': 'day', 'label': 'Today'},
    {'key': 'week', 'label': 'Week to Date'},
    {'key': 'month', 'label': 'Month to Date'},
    {'key': 'year', 'label': 'Year to Date'},
    {'key': 'custom', 'label': 'Custom range'},
  ];

  static const List<String> _branches = ['Fort Worth', 'Dallas', 'West Texas', 'Commercial'];

  String _period = 'month';
  DateTime? _from;
  DateTime? _to;
  String _branch = '';
  String _team = '';

  List<dynamic> _rows = [];
  bool _loading = true;
  String? _userId;

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

  String _fmtDate(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _fetch() async {
    if (_period == 'custom' && (_from == null || _to == null)) {
      setState(() => _loading = false);
      return;
    }
    setState(() => _loading = true);
    try {
      final query = _period == 'custom'
          ? 'from=${_fmtDate(_from!)}&to=${_fmtDate(_to!)}'
          : 'window=$_period';
      final res = await api.get(Uri.parse('https://millerstorm.tech/api/leaderboard?$query'));
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

  List<String> get _teamOptions {
    final set = <String>{};
    for (final r in _rows) {
      final t = (r['team'] ?? '').toString();
      if (t.isNotEmpty) set.add(t);
    }
    final l = set.toList()..sort();
    return l;
  }

  List<Map<String, dynamic>> get _visibleRows {
    final branchActive = _branch.isNotEmpty;
    final list = <Map<String, dynamic>>[];
    for (final raw in _rows) {
      final r = Map<String, dynamic>.from(raw as Map);
      if (branchActive) {
        final bb = r['byBranch'];
        final b = (bb is Map) ? bb[_branch] : null;
        if (b == null) continue;
        r['verifiedKnocks'] = b['verifiedKnocks'] ?? 0;
        r['filed'] = b['filed'] ?? 0;
        r['won'] = b['won'] ?? 0;
        r['revenue'] = b['revenue'] ?? 0;
      }
      if (_team.isNotEmpty && (r['team'] ?? '').toString() != _team) continue;
      list.add(r);
    }
    list.sort((a, b) {
      final ra = (a['revenue'] is num) ? a['revenue'] as num : 0;
      final rb = (b['revenue'] is num) ? b['revenue'] as num : 0;
      return rb.compareTo(ra);
    });
    return list;
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

  Future<void> _pickDate(bool isFrom) async {
    final now = DateTime.now();
    final initial = (isFrom ? _from : _to) ?? now;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: now,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(colorScheme: const ColorScheme.light(primary: _primary)),
        child: child!,
      ),
    );
    if (picked == null) return;
    setState(() {
      if (isFrom) {
        _from = picked;
      } else {
        _to = picked;
      }
    });
    if (_from != null && _to != null) _fetch();
  }

  String get _periodLabel => _periods.firstWhere((p) => p['key'] == _period)['label']!;

  @override
  Widget build(BuildContext context) {
    final visible = _visibleRows;
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Column(
          children: [
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
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _filterChip(Icons.date_range, _periodLabel, true, _openPeriodSelector),
                      _filterChip(Icons.apartment_outlined,
                          _branch.isEmpty ? 'All Branches' : _branch, _branch.isNotEmpty, _openBranchSelector),
                      _filterChip(Icons.groups_outlined,
                          _team.isEmpty ? 'All Teams' : _team, _team.isNotEmpty, _openTeamSelector),
                    ],
                  ),
                  if (_period == 'custom') ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(child: _dateChip('From', _from, () => _pickDate(true))),
                        const SizedBox(width: 8),
                        Expanded(child: _dateChip('To', _to, () => _pickDate(false))),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator(color: _primary))
                  : visible.isEmpty
                      ? const Center(
                          child: Text('No data for this filter.',
                              style: TextStyle(color: _textPlaceholder, fontSize: 14)))
                      : RefreshIndicator(
                          color: _primary,
                          onRefresh: _fetch,
                          child: ListView.builder(
                            padding: const EdgeInsets.all(14),
                            itemCount: visible.length,
                            itemBuilder: (context, i) => _row(visible[i], i),
                          ),
                        ),
            ),
            _buildBottomNav(context),
          ],
        ),
      ),
    );
  }

  Widget _filterChip(IconData icon, String label, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: active ? _primary.withOpacity(0.08) : _bg,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: active ? _primary.withOpacity(0.45) : _border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: active ? _primary : _textLight),
            const SizedBox(width: 6),
            Text(label,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: active ? _primary : _textDark)),
            const SizedBox(width: 2),
            Icon(Icons.keyboard_arrow_down, size: 17, color: active ? _primary : _textLight),
          ],
        ),
      ),
    );
  }

  void _openPeriodSelector() => _openSelector(
        title: 'Period',
        current: _period,
        options: [for (final p in _periods) MapEntry(p['key']!, p['label']!)],
        onSelect: (v) {
          setState(() => _period = v);
          if (v != 'custom') {
            _fetch();
          } else if (_from != null && _to != null) {
            _fetch();
          }
        },
      );

  void _openBranchSelector() => _openSelector(
        title: 'Branch',
        current: _branch,
        options: [const MapEntry('', 'All Branches'), for (final b in _branches) MapEntry(b, b)],
        onSelect: (v) => setState(() => _branch = v),
      );

  void _openTeamSelector() => _openSelector(
        title: 'Team',
        current: _team,
        options: [const MapEntry('', 'All Teams'), for (final t in _teamOptions) MapEntry(t, t)],
        onSelect: (v) => setState(() => _team = v),
      );

  void _openSelector({
    required String title,
    required String current,
    required List<MapEntry<String, String>> options,
    required ValueChanged<String> onSelect,
  }) {
    showModalBottomSheet(
      context: context,
      backgroundColor: _white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(2))),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 4),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _textDark)),
                ),
              ),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: options.map((o) {
                    final selected = o.key == current;
                    return InkWell(
                      onTap: () {
                        Navigator.pop(ctx);
                        onSelect(o.key);
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(o.value,
                                  style: TextStyle(
                                      fontSize: 15,
                                      color: selected ? _primary : _textDark,
                                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500)),
                            ),
                            if (selected) const Icon(Icons.check, color: _primary, size: 20),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  Widget _dateChip(String label, DateTime? value, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(color: _bg, borderRadius: BorderRadius.circular(12), border: Border.all(color: _border)),
        child: Row(
          children: [
            const Icon(Icons.calendar_today_outlined, size: 14, color: _textLight),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 10, color: _textPlaceholder, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 1),
                  Text(value == null ? 'Select' : _fmtDate(value),
                      style: TextStyle(fontSize: 13, color: value == null ? _textPlaceholder : _textDark, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(Map<String, dynamic> r, int index) {
    final rank = index + 1;
    final name = (r['name'] ?? 'Unknown Rep').toString();
    final branch = (r['branch'] ?? '').toString();
    final team = (r['team'] ?? '').toString();
    final img = (r['headshotUrl'] ?? '').toString();
    final isYou = _userId != null && r['repUserId']?.toString() == _userId;
    final knocks = r['verifiedKnocks'] ?? 0;
    final filed = r['filed'] ?? 0;
    final won = r['won'] ?? 0;
    final subtitle = [branch, team].where((s) => s.isNotEmpty).join(' · ');

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
                SizedBox(
                  width: 34,
                  child: medal != null
                      ? Text(medal, style: const TextStyle(fontSize: 24), textAlign: TextAlign.center)
                      : Text('$rank',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _textLight)),
                ),
                const SizedBox(width: 8),
                Container(
                  width: 44,
                  height: 44,
                  decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF374151)),
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
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isYou ? '$name (You)' : name,
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _textDark),
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                      ),
                      if (subtitle.isNotEmpty)
                        Text(subtitle, style: const TextStyle(fontSize: 12, color: _textPlaceholder),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                Text(_money(r['revenue']),
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: _green)),
              ],
            ),
            const SizedBox(height: 10),
            Container(height: 1, color: const Color(0xFFF3F4F6)),
            const SizedBox(height: 8),
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
              _navItem(context, Icons.apps_outlined, 'Tools', false, '/manager-apps-tools-items'),
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
              Icon(icon, color: active ? _primary : _textPlaceholder, size: 24),
              const SizedBox(height: 4),
              Text(label,
                  style: TextStyle(fontSize: 10, color: active ? _primary : _textPlaceholder, fontWeight: active ? FontWeight.w600 : FontWeight.normal),
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
        decoration: BoxDecoration(color: _primary.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: _primary, size: 24),
            const SizedBox(height: 4),
            Text(label,
                style: const TextStyle(fontSize: 10, color: _primary, fontWeight: FontWeight.w600),
                maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
