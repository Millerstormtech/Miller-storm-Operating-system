import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:math' as math;
import '../services/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:cached_network_image/cached_network_image.dart';

// Course Leaderboard — mirrors the web "Training Leaderboard": an Overall board
// ranked across every course (rank tiers, badges, progress rings, Top 3 / Not
// started sections) plus a By-Course view. Self-contained per panel.
class BranchManagerTrainingLeaderboardScreen extends StatefulWidget {
  const BranchManagerTrainingLeaderboardScreen({super.key});

  @override
  State<BranchManagerTrainingLeaderboardScreen> createState() => _BranchManagerTrainingLeaderboardScreenState();
}

class _BranchManagerTrainingLeaderboardScreenState extends State<BranchManagerTrainingLeaderboardScreen> {
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
  bool _teamStandingsOpen = false;

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

  // Rep's company-wide rank from the Overall rows (for the By-Course "co.#X").
  int? _overallRankFor(String id) {
    for (final r in _rows) {
      if ('${r['id']}' == id) {
        final rk = r['rank'];
        return rk is int ? rk : int.tryParse('$rk');
      }
    }
    return null;
  }

  // Weekly rank-change arrow (▲/▼), from the API's rankDelta. Absent/0 → nothing.
  Widget _rankDeltaWidget(Map<String, dynamic> r) {
    final d = r['rankDelta'];
    if (d is! num || d == 0) return const SizedBox.shrink();
    final up = d > 0;
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Text(
        up ? '▲${d.toInt()}' : '▼${(-d).toInt()}',
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: up ? _green : _primary),
      ),
    );
  }

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

  // Tap a rep → a bottom sheet with their course-by-course video/quiz breakdown.
  void _openRepDetail(String id) {
    if (id.isEmpty || id == 'null') return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _RepDetailSheet(repId: id, tierColors: _tierColors),
    );
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
        _teamStandingsCard(),
        _legend(),
        const SizedBox(height: 6),
        ...children,
      ],
    );
  }

  // Team vs Team (collapsible): teams ranked by average completion % across all
  // their reps (zeros included). A branch filter hides other branches' teams but
  // never renumbers ranks — same rule as the web.
  Widget _teamStandingsCard() {
    final byTeam = <String, List<double>>{};
    final teamBranch = <String, String>{};
    for (final r in _rows) {
      final t = (r['team'] ?? '').toString();
      if (t.isEmpty) continue;
      final pct = (r['pct'] is num) ? (r['pct'] as num).toDouble() : 0.0;
      (byTeam[t] ??= []).add(pct);
      final b = (r['branch'] ?? '').toString();
      if (b.isNotEmpty) teamBranch[t] = b;
    }
    if (byTeam.isEmpty) return const SizedBox.shrink();
    final standings = byTeam.entries.map((e) {
      final avg = (e.value.reduce((a, b) => a + b) / e.value.length).round();
      return {'team': e.key, 'size': e.value.length, 'avgPct': avg, 'rank': 0};
    }).toList();
    standings.sort((a, b) {
      final d = (b['avgPct'] as int).compareTo(a['avgPct'] as int);
      return d != 0 ? d : (a['team'] as String).compareTo(b['team'] as String);
    });
    for (var i = 0; i < standings.length; i++) {
      standings[i]['rank'] = i + 1;
    }
    final visible = _branch.isEmpty
        ? standings
        : standings.where((s) => teamBranch[s['team']] == _branch).toList();
    if (visible.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(color: _white, borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => _teamStandingsOpen = !_teamStandingsOpen),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  const Icon(Icons.groups_outlined, size: 16, color: _textMedium),
                  const SizedBox(width: 8),
                  const Expanded(child: Text('Team Standings', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: _textDark))),
                  Icon(_teamStandingsOpen ? Icons.expand_less : Icons.expand_more, size: 20, color: _textLight),
                ],
              ),
            ),
          ),
          if (_teamStandingsOpen)
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
              child: Column(
                children: visible.map((s) {
                  final rank = s['rank'] as int;
                  final avg = s['avgPct'] as int;
                  final size = s['size'] as int;
                  final highlight = _team.isNotEmpty && s['team'] == _team;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 2),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
                    decoration: BoxDecoration(
                      color: highlight ? const Color(0xFFEEF2FF) : Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: highlight ? const Color(0xFFC7D2FE) : Colors.transparent),
                    ),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 22,
                          child: Center(
                            child: rank <= 3
                                ? Text(_medalEmoji[rank - 1], style: const TextStyle(fontSize: 14))
                                : Text('$rank', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _textPlaceholder)),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Team ${s['team']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _textDark)),
                              const SizedBox(height: 3),
                              Row(
                                children: [
                                  Expanded(
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(3),
                                      child: LinearProgressIndicator(
                                        value: (avg.clamp(0, 100)) / 100.0,
                                        minHeight: 5,
                                        backgroundColor: _ringTrack,
                                        valueColor: const AlwaysStoppedAnimation(_green),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Text('$avg%', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _textDark)),
                                ],
                              ),
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text('$size rep${size == 1 ? '' : 's'}', style: const TextStyle(fontSize: 10, color: _textPlaceholder)),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
        ],
      ),
    );
  }

  // ---- By-course view ----
  Widget _buildByCourse() {
    if (_selectedCourse == null) return _empty('Pick a course to see its board');
    if (_courseRows.isEmpty) return _empty('No data for this course');
    final rows = _courseRows; // server already sorts by pct desc
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
      children: [
        _courseHeaderCard(),
        for (var i = 0; i < rows.length; i++) _courseCard(rows[i], i),
      ],
    );
  }

  // By-course header: video/quiz counts, started + average, and a Finishers
  // strip (only for courses that have videos, matching the web's guard).
  Widget _courseHeaderCard() {
    final c = _selectedCourse;
    final videos = (c?['videos'] is num) ? (c['videos'] as num).toInt() : null;
    final quizzes = (c?['quizzes'] is num) ? (c['quizzes'] as num).toInt() : null;
    final total = _courseRows.length;
    final started = _courseRows.where((r) => ((r['done'] ?? 0) as num) > 0).length;
    final avg = total == 0
        ? 0
        : (_courseRows.fold<double>(0, (s, r) => s + ((r['pct'] is num) ? (r['pct'] as num).toDouble() : 0)) / total).round();
    final finishers = (videos != null && videos > 0)
        ? _courseRows.where((r) => ((r['total'] ?? 0) as num) > 0 && r['done'] == r['total']).toList()
        : <Map<String, dynamic>>[];
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
      decoration: BoxDecoration(color: _white, borderRadius: BorderRadius.circular(12), border: Border.all(color: _border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(spacing: 14, runSpacing: 6, children: [
            if (videos != null) Text('🎬 $videos videos', style: const TextStyle(fontSize: 12, color: _textMedium)),
            if (quizzes != null) Text('✅ $quizzes quizzes', style: const TextStyle(fontSize: 12, color: _textMedium)),
            Text('Started: $started of $total reps', style: const TextStyle(fontSize: 12, color: _textMedium)),
            Text('Average: $avg% (all reps)', style: const TextStyle(fontSize: 12, color: _textMedium)),
          ]),
          const SizedBox(height: 10),
          const Text('FINISHERS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: _textLight, letterSpacing: 0.5)),
          const SizedBox(height: 5),
          if (finishers.isEmpty)
            const Text('No finishers yet.', style: TextStyle(fontSize: 12, color: _textPlaceholder, fontStyle: FontStyle.italic))
          else
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: finishers.map((f) {
                return Container(
                  padding: const EdgeInsets.fromLTRB(4, 3, 10, 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    border: Border.all(color: const Color(0xFFBBF7D0)),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    _avatar((f['name'] ?? '').toString(), (f['headshotUrl'] ?? '').toString(), 10),
                    const SizedBox(width: 6),
                    Text((f['name'] ?? '').toString(), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF166534))),
                  ]),
                );
              }).toList(),
            ),
        ],
      ),
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

    return GestureDetector(
      onTap: () => _openRepDetail('${r['id']}'),
      child: _cardShell(
      isMe: isMe,
      accent: medal ? _medalEdge[rank! - 1] : _indigo,
      showAccent: medal || isMe,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 30,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                medal
                    ? Text(_medalEmoji[rank! - 1], style: const TextStyle(fontSize: 22))
                    : Text(rank?.toString() ?? '·', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _textLight)),
                _rankDeltaWidget(r),
              ],
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
    final coRank = _overallRankFor('${r['id']}');
    return GestureDetector(
      onTap: () => _openRepDetail('${r['id']}'),
      child: _cardShell(
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
                Row(
                  children: [
                    Text('${r['done'] ?? 0}/${r['total'] ?? 0} lessons', style: const TextStyle(fontSize: 11.5, color: _textLight)),
                    if (coRank != null) ...[
                      const SizedBox(width: 8),
                      Text('co.#$coRank', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: _textLight)),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _progressRing(pct),
        ],
      ),
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
        painter: _RingPainter(pct.clamp(0, 100) / 100.0),
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
class _RingPainter extends CustomPainter {
  final double t; // 0..1
  _RingPainter(this.t);

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
  bool shouldRepaint(covariant _RingPainter old) => old.t != t;
}

// Rep Detail sheet: per-rep, course-by-course video + quiz breakdown. Fetched
// from /api/training/rep/:id (never returns email/role). Degrades to an error
// state if the endpoint isn't deployed yet.
class _RepDetailSheet extends StatefulWidget {
  final String repId;
  final Map<String, List<Color>> tierColors;
  const _RepDetailSheet({required this.repId, required this.tierColors});

  @override
  State<_RepDetailSheet> createState() => _RepDetailSheetState();
}

class _RepDetailSheetState extends State<_RepDetailSheet> {
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFE5E7EB);
  static const _bg = Color(0xFFF3F4F6);
  static const _green = Color(0xFF10B981);
  static const _avatarPalette = [
    Color(0xFF4F46E5), Color(0xFFDB2777), Color(0xFF0891B2), Color(0xFF16A34A),
    Color(0xFF7C3AED), Color(0xFFEA580C), Color(0xFF0D9488), Color(0xFFB91C1C),
  ];

  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    try {
      final res = await api
          .get(Uri.parse('https://millerstorm.tech/api/training/rep/${widget.repId}'))
          .timeout(const Duration(seconds: 20));
      if (!mounted) return;
      if (res.statusCode == 200) {
        setState(() {
          _data = Map<String, dynamic>.from(json.decode(res.body));
          _loading = false;
        });
      } else {
        setState(() { _error = true; _loading = false; });
      }
    } catch (_) {
      if (mounted) setState(() { _error = true; _loading = false; });
    }
  }

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

  Widget _avatar(String name, String headshotUrl, double radius) {
    if (headshotUrl.isNotEmpty) {
      final url = headshotUrl.startsWith('http') ? headshotUrl : 'https://millerstorm.tech$headshotUrl';
      return CircleAvatar(radius: radius, backgroundColor: _border, backgroundImage: CachedNetworkImageProvider(url));
    }
    return CircleAvatar(
      radius: radius,
      backgroundColor: _avatarColor(name),
      child: Text(_initials(name), style: TextStyle(color: _white, fontSize: radius * 0.7, fontWeight: FontWeight.w700)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (ctx, scroll) => Container(
        decoration: const BoxDecoration(color: _white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        child: _loading
            ? const Center(child: Padding(padding: EdgeInsets.all(48), child: CircularProgressIndicator(color: _primary)))
            : (_error || _data == null)
                ? const Center(child: Padding(padding: EdgeInsets.all(48), child: Text("Couldn't load this rep.", style: TextStyle(color: _textPlaceholder, fontSize: 14))))
                : _content(scroll),
      ),
    );
  }

  Widget _content(ScrollController scroll) {
    final d = _data!;
    final name = (d['name'] ?? 'Unknown').toString();
    final tier = (d['rankTitle'] ?? '').toString();
    final branch = (d['branch'] ?? '').toString();
    final team = (d['team'] ?? '').toString();
    final rank = d['rank'];
    final pct = (d['pct'] is num) ? (d['pct'] as num).round() : 0;
    final courses = (d['courses'] as List?) ?? [];
    return ListView(
      controller: scroll,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
      children: [
        Center(child: Container(width: 40, height: 4, margin: const EdgeInsets.only(bottom: 14), decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(2)))),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _avatar(name, (d['headshotUrl'] ?? '').toString(), 26),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _textDark)),
                  const SizedBox(height: 5),
                  Row(children: [
                    if (tier.isNotEmpty && widget.tierColors.containsKey(tier)) ...[
                      _tierPill(tier),
                      const SizedBox(width: 6),
                    ],
                    Flexible(child: Text([if (branch.isNotEmpty) branch, if (team.isNotEmpty) 'Team $team'].join(' · '), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: _textLight))),
                  ]),
                ],
              ),
            ),
            if (rank is num)
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('#$rank', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: _primary)),
                const Text('company', style: TextStyle(fontSize: 10, color: _textPlaceholder)),
              ]),
          ],
        ),
        const SizedBox(height: 14),
        Row(children: [
          _statBox('${d['itemsCompleted'] ?? 0} / ${d['totalItems'] ?? 0}', 'Lessons & quizzes'),
          const SizedBox(width: 10),
          _statBox('${d['coursesCompleted'] ?? 0} / ${d['totalCourses'] ?? 0}', 'Courses done'),
          const SizedBox(width: 10),
          _statBox('$pct%', 'Overall'),
        ]),
        const SizedBox(height: 18),
        const Text('COURSE-BY-COURSE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: _textLight, letterSpacing: 0.5)),
        const SizedBox(height: 8),
        ...courses.map((c) => _courseRow(Map<String, dynamic>.from(c))),
      ],
    );
  }

  Widget _tierPill(String tier) {
    final c = widget.tierColors[tier]!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: c[0], borderRadius: BorderRadius.circular(20)),
      child: Text(tier, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: c[1])),
    );
  }

  Widget _statBox(String value, String label) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(color: _bg, borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
        child: Column(children: [
          Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: _textDark)),
          const SizedBox(height: 3),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10.5, color: _textLight)),
        ]),
      ),
    );
  }

  Widget _courseRow(Map<String, dynamic> c) {
    final title = (c['title'] ?? 'Untitled').toString();
    final vW = c['videosWatched'] ?? 0;
    final vT = c['videosTotal'] ?? 0;
    final qP = c['quizzesPassed'] ?? 0;
    final qT = c['quizzesTotal'] ?? 0;
    final pct = (c['pct'] is num) ? (c['pct'] as num).round() : 0;
    final complete = c['complete'] == true;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: _white, borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(child: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: _textDark))),
            if (complete) const Padding(padding: EdgeInsets.only(left: 6), child: Text('🏁', style: TextStyle(fontSize: 14))),
          ]),
          const SizedBox(height: 6),
          Row(children: [
            Text('🎬 $vW/$vT', style: const TextStyle(fontSize: 12, color: _textLight)),
            const SizedBox(width: 14),
            Text('✅ $qP/$qT', style: const TextStyle(fontSize: 12, color: _textLight)),
            const Spacer(),
            Text('$pct%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: complete ? _green : _textDark)),
          ]),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: (pct.clamp(0, 100)) / 100.0,
              minHeight: 5,
              backgroundColor: _border,
              valueColor: const AlwaysStoppedAnimation(_green),
            ),
          ),
        ],
      ),
    );
  }
}
