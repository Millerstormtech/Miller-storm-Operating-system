import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:math' as math;
import '../services/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:cached_network_image/cached_network_image.dart';

// Course Leaderboard — mirrors the web "Training Leaderboard": an Overall board
// ranked across every course (rank tiers, badges, progress rings, Top 3 / Not
// started sections) plus a By-Course view. Self-contained per panel.
class CLevelTrainingLeaderboardScreen extends StatefulWidget {
  const CLevelTrainingLeaderboardScreen({super.key});

  @override
  State<CLevelTrainingLeaderboardScreen> createState() => _CLevelTrainingLeaderboardScreenState();
}

class _CLevelTrainingLeaderboardScreenState extends State<CLevelTrainingLeaderboardScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFE5E7EB);
  static const _green = Color(0xFF10B981); // ring fill (same as lesson ticks)
  static const _ringTrack = Color(0xFFE5E7EB);
  static const _indigo = Color(0xFF4F46E5); // YOU pill

  static const _medalEmoji = ['🥇', '🥈', '🥉'];
  static const _medalEdge = [Color(0xFFF59E0B), Color(0xFF9CA3AF), Color(0xFFB45309)];

  // Rank tiers → (bg, fg). Matches web constants.ts TIER_COLORS.
  static const Map<String, List<Color>> _tierColors = {
    'Rookie': [Color(0xFFF3F4F6), Color(0xFF6B7280)],
    'Rising': [Color(0xFFDBEAFE), Color(0xFF1D4ED8)],
    'Pro': [Color(0xFFDCFCE7), Color(0xFF15803D)],
    'Ace': [Color(0xFFEDE9FE), Color(0xFF6D28D9)],
    'Elite': [Color(0xFFFEF3C7), Color(0xFFB45309)],
    'Legend': [Color(0xFFFDE68A), Color(0xFF7C2D12)],
  };

  static const Map<String, String> _badgeEmoji = {
    'halfway': '🚀',
    'finisher': '🏁',
    'graduate': '🎓',
    'test-ace': '🎯',
  };

  static const _avatarPalette = [
    Color(0xFF4F46E5), Color(0xFFDB2777), Color(0xFF0891B2), Color(0xFF16A34A),
    Color(0xFF7C3AED), Color(0xFFEA580C), Color(0xFF0D9488), Color(0xFFB91C1C),
  ];

  // View
  String _view = 'overall'; // 'overall' | 'course'
  bool _loading = true;
  String? _userId;

  // Overall data
  List<Map<String, dynamic>> _rows = [];
  int _totalCourses = 0;
  int _totalItems = 0;
  List<dynamic> _courses = [];

  // By-course data
  dynamic _selectedCourse;
  List<Map<String, dynamic>> _courseRows = [];

  // Filters
  String _search = '';
  String _branch = '';
  String _team = '';
  bool _legendOpen = false;
  bool _notStartedOpen = false;

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
        final u = jsonDecode(userStr);
        _userId = (u['id'] ?? u['_id'])?.toString();
      }
    } catch (_) {}
    await _fetchOverall();
  }

  Future<void> _fetchOverall() async {
    setState(() => _loading = true);
    try {
      final res = await api
          .get(Uri.parse('https://millerstorm.tech/api/training/leaderboard?scope=overall'))
          .timeout(const Duration(seconds: 20));
      if (res.statusCode == 200) {
        final data = json.decode(res.body);
        setState(() {
          _rows = ((data['rows'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
          _totalCourses = data['totalCourses'] ?? 0;
          _totalItems = data['totalItems'] ?? 0;
          _courses = (data['courses'] as List?) ?? [];
          _loading = false;
        });
      } else {
        setState(() => _loading = false);
      }
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  Future<void> _fetchCourse(dynamic course) async {
    setState(() {
      _loading = true;
      _selectedCourse = course;
    });
    try {
      final res = await api
          .get(Uri.parse('https://millerstorm.tech/api/leaderboard?courseId=${course['id']}'))
          .timeout(const Duration(seconds: 20));
      if (res.statusCode == 200) {
        final data = json.decode(res.body);
        final List<dynamic> rows = data['rows'] ?? [];
        setState(() {
          _courseRows = rows.map((e) => Map<String, dynamic>.from(e)).toList();
          _loading = false;
        });
      } else {
        setState(() => _loading = false);
      }
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  // ---- helpers ----
  Color _avatarColor(String name) {
    var h = 0;
    for (final ch in name.runes) {
      h = (h * 31 + ch) & 0x7fffffff;
    }
    return _avatarPalette[h % _avatarPalette.length];
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return parts.take(2).map((w) => w[0].toUpperCase()).join();
  }

  List<String> get _branchOptions {
    final s = <String>{};
    for (final r in _rows) {
      final b = (r['branch'] ?? '').toString();
      if (b.isNotEmpty) s.add(b);
    }
    final l = s.toList()..sort();
    return l;
  }

  List<String> get _teamOptions {
    final s = <String>{};
    for (final r in _rows) {
      final t = (r['team'] ?? '').toString();
      if (t.isNotEmpty) s.add(t);
    }
    final l = s.toList()..sort();
    return l;
  }

  bool get _filterActive => _search.isNotEmpty || _branch.isNotEmpty || _team.isNotEmpty;

  List<Map<String, dynamic>> get _startedRows =>
      _rows.where((r) => r['notStarted'] != true).toList();

  List<Map<String, dynamic>> _applyFilters(List<Map<String, dynamic>> rows) {
    final q = _search.toLowerCase();
    return rows.where((r) {
      if (q.isNotEmpty && !(r['name'] ?? '').toString().toLowerCase().contains(q)) return false;
      if (_branch.isNotEmpty && (r['branch'] ?? '').toString() != _branch) return false;
      if (_team.isNotEmpty && (r['team'] ?? '').toString() != _team) return false;
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _textDark),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text('🏆 Course Leaderboard',
            style: TextStyle(color: _textDark, fontSize: 18, fontWeight: FontWeight.w700)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : Column(
              children: [
                _buildHeader(),
                Expanded(child: _view == 'overall' ? _buildOverall() : _buildByCourse()),
              ],
            ),
    );
  }

  // Subtitle + Overall/By-Course toggle + (overall) search/branch/team.
  Widget _buildHeader() {
    return Container(
      width: double.infinity,
      color: _white,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _view == 'overall'
                ? 'Ranked across all $_totalCourses courses · $_totalItems lessons & quizzes'
                : (_selectedCourse?['title'] ?? 'Select a course'),
            style: const TextStyle(color: _textLight, fontSize: 12.5),
          ),
          const SizedBox(height: 10),
          _segmentedToggle(),
          if (_view == 'overall') ...[
            const SizedBox(height: 10),
            _searchField(),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: _dropdownChip('All Branches', _branch, _branchOptions, (v) => setState(() => _branch = v))),
                const SizedBox(width: 8),
                Expanded(child: _dropdownChip('All Teams', _team, _teamOptions, (v) => setState(() => _team = v))),
              ],
            ),
          ] else ...[
            const SizedBox(height: 10),
            _coursePickerButton(),
          ],
        ],
      ),
    );
  }

  Widget _segmentedToggle() {
    Widget seg(String key, String label) {
      final on = _view == key;
      return Expanded(
        child: GestureDetector(
          onTap: () {
            if (on) return;
            setState(() => _view = key);
            if (key == 'course') {
              if (_selectedCourse == null && _courses.isNotEmpty) {
                _fetchCourse(_courses[0]);
              } else if (_selectedCourse != null && _courseRows.isEmpty) {
                _fetchCourse(_selectedCourse);
              }
            }
          },
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 9),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: on ? _primary : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(label,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: on ? _white : _textLight)),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: _bg, borderRadius: BorderRadius.circular(10)),
      child: Row(children: [seg('overall', 'Overall'), seg('course', 'By Course')]),
    );
  }

  Widget _searchField() {
    return TextField(
      onChanged: (v) => setState(() => _search = v),
      decoration: InputDecoration(
        hintText: 'Search reps…',
        hintStyle: const TextStyle(color: _textPlaceholder, fontSize: 14),
        prefixIcon: const Icon(Icons.search, size: 20, color: _textLight),
        isDense: true,
        filled: true,
        fillColor: _bg,
        contentPadding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
      ),
    );
  }

  Widget _dropdownChip(String allLabel, String current, List<String> options, ValueChanged<String> onSelect) {
    final label = current.isEmpty ? allLabel : current;
    return GestureDetector(
      onTap: () {
        showModalBottomSheet(
          context: context,
          backgroundColor: _white,
          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
          builder: (ctx) => SafeArea(
            child: ListView(
              shrinkWrap: true,
              children: [
                const SizedBox(height: 8),
                ...[MapEntry('', allLabel), ...options.map((o) => MapEntry(o, o))].map((e) {
                  final sel = e.key == current;
                  return ListTile(
                    title: Text(e.value, style: TextStyle(color: sel ? _primary : _textDark, fontWeight: sel ? FontWeight.w700 : FontWeight.w500)),
                    trailing: sel ? const Icon(Icons.check, color: _primary, size: 20) : null,
                    onTap: () { Navigator.pop(ctx); onSelect(e.key); },
                  );
                }),
              ],
            ),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: current.isEmpty ? _bg : _primary.withOpacity(0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: current.isEmpty ? _border : _primary.withOpacity(0.4)),
        ),
        child: Row(
          children: [
            Expanded(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: current.isEmpty ? _textDark : _primary))),
            Icon(Icons.keyboard_arrow_down, size: 18, color: current.isEmpty ? _textLight : _primary),
          ],
        ),
      ),
    );
  }

  Widget _coursePickerButton() {
    return GestureDetector(
      onTap: () {
        showModalBottomSheet(
          context: context,
          backgroundColor: _white,
          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
          builder: (ctx) => SafeArea(
            child: ListView(
              shrinkWrap: true,
              children: [
                const SizedBox(height: 8),
                ..._courses.map((c) {
                  final sel = _selectedCourse != null && _selectedCourse['id'] == c['id'];
                  return ListTile(
                    title: Text(c['title'] ?? 'Untitled', style: TextStyle(color: sel ? _primary : _textDark, fontWeight: sel ? FontWeight.w700 : FontWeight.w500)),
                    trailing: sel ? const Icon(Icons.check, color: _primary, size: 20) : null,
                    onTap: () { Navigator.pop(ctx); _fetchCourse(c); },
                  );
                }),
              ],
            ),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: _bg, borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
        child: Row(
          children: [
            const Icon(Icons.menu_book_outlined, size: 18, color: _textLight),
            const SizedBox(width: 8),
            Expanded(child: Text(_selectedCourse?['title'] ?? 'Select a course', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: _textDark))),
            const Icon(Icons.keyboard_arrow_down, size: 20, color: _textLight),
          ],
        ),
      ),
    );
  }

  // ---- Overall view ----
  Widget _buildOverall() {
    if (_rows.isEmpty) return _empty('No training data yet');
    final started = _applyFilters(_startedRows);
    final notStarted = _rows.where((r) => r['notStarted'] == true).toList()
      ..sort((a, b) => (a['name'] ?? '').toString().compareTo((b['name'] ?? '').toString()));

    final children = <Widget>[];

    if (_filterActive) {
      children.add(_sectionLabel('Results (${started.length})'));
      for (final r in started) {
        children.add(_repCard(r, showMedal: false));
      }
      if (started.isEmpty) children.add(_empty('No reps match'));
    } else {
      final top3 = started.take(3).toList();
      final rest = started.skip(3).toList();
      if (top3.isNotEmpty) {
        children.add(_sectionLabel('Top 3'));
        for (final r in top3) {
          children.add(_repCard(r, showMedal: true));
        }
      }
      if (rest.isNotEmpty) {
        children.add(_sectionLabel('All reps'));
        for (final r in rest) {
          children.add(_repCard(r, showMedal: false));
        }
      }
      if (notStarted.isNotEmpty) {
        children.add(_notStartedGroup(notStarted));
      }
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
      children: [
        _legend(),
        const SizedBox(height: 6),
        ...children,
      ],
    );
  }

  // ---- By-course view ----
  Widget _buildByCourse() {
    if (_selectedCourse == null) return _empty('Pick a course to see its board');
    if (_courseRows.isEmpty) return _empty('No data for this course');
    final q = _search.toLowerCase();
    final rows = _courseRows; // server already sorts by pct desc
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
      itemCount: rows.length,
      itemBuilder: (c, i) => _courseCard(rows[i], i),
    );
  }

  Widget _sectionLabel(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 14, 4, 8),
        child: Text(t, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: _textLight, letterSpacing: 0.3)),
      );

  Widget _empty(String msg) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('🏆', style: TextStyle(fontSize: 48)),
              const SizedBox(height: 12),
              Text(msg, style: const TextStyle(color: _textPlaceholder, fontSize: 14)),
            ],
          ),
        ),
      );

  // Card shell: a uniform rounded border + an optional clipped left accent
  // strip. A non-uniform Border (thick left edge) combined with borderRadius
  // crashes Flutter, so the medal / "me" edge is an inner clipped strip.
  Widget _cardShell({required bool isMe, required Color accent, required bool showAccent, required Widget child}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isMe ? _indigo.withOpacity(0.35) : _border),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(11),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (showAccent) Container(width: 4, color: accent),
              Expanded(
                child: Container(
                  color: isMe ? const Color(0xFFEEF2FF) : _white,
                  padding: const EdgeInsets.all(12),
                  child: child,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // The Overall row card (rank/medal, avatar, name+tier+badges, progress ring).
  Widget _repCard(Map<String, dynamic> r, {required bool showMedal}) {
    final rank = (r['rank'] is int) ? r['rank'] as int : int.tryParse('${r['rank']}');
    final isMe = _userId != null && '${r['id']}' == _userId;
    final medal = showMedal && rank != null && rank >= 1 && rank <= 3;
    final pct = (r['pct'] is num) ? (r['pct'] as num).toDouble() : 0.0;
    final name = (r['name'] ?? 'Unknown').toString();
    final tier = (r['rankTitle'] ?? '').toString();
    final branch = (r['branch'] ?? '').toString();
    final team = (r['team'] ?? '').toString();
    final badges = (r['badges'] as List?) ?? [];

    return _cardShell(
      isMe: isMe,
      accent: medal ? _medalEdge[rank! - 1] : _indigo,
      showAccent: medal || isMe,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 30,
            child: Center(
              child: medal
                  ? Text(_medalEmoji[rank! - 1], style: const TextStyle(fontSize: 22))
                  : Text(rank?.toString() ?? '·', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _textLight)),
            ),
          ),
          const SizedBox(width: 8),
          _avatar(name, (r['headshotUrl'] ?? '').toString(), 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Flexible(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _textDark))),
                    if (r['isPodium'] == true) const Padding(padding: EdgeInsets.only(left: 4), child: Text('🏆', style: TextStyle(fontSize: 13))),
                    if (isMe) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(color: _indigo, borderRadius: BorderRadius.circular(6)),
                        child: const Text('YOU', style: TextStyle(color: _white, fontSize: 9, fontWeight: FontWeight.w800)),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    if (tier.isNotEmpty && _tierColors.containsKey(tier)) _tierPill(tier),
                    if (tier.isNotEmpty) const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        [if (branch.isNotEmpty) branch, if (team.isNotEmpty) 'Team $team'].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11.5, color: _textLight),
                      ),
                    ),
                  ],
                ),
                if (badges.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(
                      badges.map((b) => _badgeEmoji[b.toString()] ?? '').join(' '),
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _progressRing(pct),
        ],
      ),
    );
  }

  // By-course row: rank/medal, avatar, name, ring(pct), done/total.
  Widget _courseCard(Map<String, dynamic> r, int index) {
    final rank = index + 1;
    final medal = rank <= 3;
    final isMe = _userId != null && '${r['id']}' == _userId;
    final pct = (r['pct'] is num) ? (r['pct'] as num).toDouble() : 0.0;
    final name = (r['name'] ?? 'Unknown').toString();
    return _cardShell(
      isMe: isMe,
      accent: medal ? _medalEdge[rank - 1] : _indigo,
      showAccent: medal || isMe,
      child: Row(
        children: [
          SizedBox(
            width: 30,
            child: Center(
              child: medal
                  ? Text(_medalEmoji[rank - 1], style: const TextStyle(fontSize: 22))
                  : Text('$rank', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _textLight)),
            ),
          ),
          const SizedBox(width: 8),
          _avatar(name, (r['headshotUrl'] ?? '').toString(), 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(children: [
                  Flexible(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _textDark))),
                  if (isMe) ...[
                    const SizedBox(width: 6),
                    Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1), decoration: BoxDecoration(color: _indigo, borderRadius: BorderRadius.circular(6)), child: const Text('YOU', style: TextStyle(color: _white, fontSize: 9, fontWeight: FontWeight.w800))),
                  ],
                ]),
                const SizedBox(height: 3),
                Text('${r['done'] ?? 0}/${r['total'] ?? 0} lessons', style: const TextStyle(fontSize: 11.5, color: _textLight)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _progressRing(pct),
        ],
      ),
    );
  }

  Widget _avatar(String name, String headshotUrl, double radius) {
    if (headshotUrl.isNotEmpty) {
      final url = headshotUrl.startsWith('http') ? headshotUrl : 'https://millerstorm.tech$headshotUrl';
      return CircleAvatar(
        radius: radius,
        backgroundColor: _border,
        backgroundImage: CachedNetworkImageProvider(url),
      );
    }
    return CircleAvatar(
      radius: radius,
      backgroundColor: _avatarColor(name),
      child: Text(_initials(name), style: TextStyle(color: _white, fontSize: radius * 0.7, fontWeight: FontWeight.w700)),
    );
  }

  Widget _tierPill(String tier) {
    final c = _tierColors[tier]!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: c[0], borderRadius: BorderRadius.circular(20)),
      child: Text(tier, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: c[1])),
    );
  }

  Widget _progressRing(double pct) {
    return SizedBox(
      width: 46,
      height: 46,
      child: CustomPaint(
        painter: _RingPainterCLevel(pct.clamp(0, 100) / 100.0),
        child: Center(
          child: Text('${pct.round()}%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: _textDark)),
        ),
      ),
    );
  }

  // Collapsible legend: what the badges + rank tiers mean.
  Widget _legend() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFDE68A)),
      ),
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => _legendOpen = !_legendOpen),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, size: 16, color: Color(0xFF92400E)),
                  const SizedBox(width: 8),
                  const Expanded(child: Text('What the icons and ranks mean', style: TextStyle(fontSize: 12.5, color: Color(0xFF92400E), fontWeight: FontWeight.w600))),
                  Icon(_legendOpen ? Icons.expand_less : Icons.expand_more, size: 20, color: const Color(0xFF92400E)),
                ],
              ),
            ),
          ),
          if (_legendOpen)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Badges', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: _textLight)),
                  const SizedBox(height: 4),
                  _legendLine('🚀 Halfway: 50% of the library'),
                  _legendLine('🏁 Finisher: a course fully done'),
                  _legendLine('🎓 Graduate: every course done'),
                  _legendLine('🎯 Test Ace: 100% on a Final Test'),
                  _legendLine('🏆 Podium: currently top 3 (live)'),
                  const SizedBox(height: 10),
                  const Text('Ranks', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: _textLight)),
                  const SizedBox(height: 6),
                  Wrap(spacing: 6, runSpacing: 6, children: _tierColors.keys.map(_tierPill).toList()),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _legendLine(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: Text(t, style: const TextStyle(fontSize: 12, color: _textMedium)),
      );

  static const _textMedium = Color(0xFF374151);

  Widget _notStartedGroup(List<Map<String, dynamic>> rows) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: _border, style: BorderStyle.solid),
        ),
        child: Column(
          children: [
            InkWell(
              onTap: () => setState(() => _notStartedOpen = !_notStartedOpen),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                child: Row(
                  children: [
                    Expanded(child: Text('Not started: ${rows.length} reps', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _textLight))),
                    Icon(_notStartedOpen ? Icons.expand_less : Icons.expand_more, size: 20, color: _textLight),
                  ],
                ),
              ),
            ),
            if (_notStartedOpen)
              ...rows.map((r) => Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    child: Row(
                      children: [
                        _avatar((r['name'] ?? '').toString(), (r['headshotUrl'] ?? '').toString(), 14),
                        const SizedBox(width: 10),
                        Expanded(child: Text((r['name'] ?? 'Unknown').toString(), style: const TextStyle(fontSize: 13.5, color: _textDark))),
                        Text([if ((r['branch'] ?? '').toString().isNotEmpty) r['branch']].join(), style: const TextStyle(fontSize: 11.5, color: _textPlaceholder)),
                      ],
                    ),
                  )),
            const SizedBox(height: 6),
          ],
        ),
      ),
    );
  }
}

// Circular progress ring: grey track + green arc, matching the web ProgressRing.
class _RingPainterCLevel extends CustomPainter {
  final double t; // 0..1
  _RingPainterCLevel(this.t);

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 5.0;
    final rect = Offset(stroke / 2, stroke / 2) & Size(size.width - stroke, size.height - stroke);
    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = const Color(0xFFE5E7EB);
    final fill = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = const Color(0xFF10B981);
    canvas.drawArc(rect, 0, 2 * math.pi, false, track);
    if (t > 0) {
      canvas.drawArc(rect, -math.pi / 2, 2 * math.pi * t, false, fill);
    }
  }

  @override
  bool shouldRepaint(covariant _RingPainterCLevel old) => old.t != t;
}
