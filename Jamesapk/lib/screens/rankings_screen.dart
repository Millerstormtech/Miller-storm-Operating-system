import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:showcaseview/showcaseview.dart';
import '../services/api_client.dart';
import 'scoreboard_screen.dart';

// Sales Leaderboard for reps — Period / Branch / Team filters + Custom range,
// live from AccuLynx + RepCard via /api/leaderboard. Self-contained per panel.
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
  static const _green = Color(0xFF16A34A);

  static const List<Map<String, String>> _periods = [
    {'key': 'day', 'label': 'Today'},
    {'key': 'week', 'label': 'Week to Date'},
    {'key': 'month', 'label': 'Month to Date'},
    {'key': 'year', 'label': 'Year to Date'},
    {'key': 'custom', 'label': 'Custom range'},
  ];

  static const List<String> _branches = ['Fort Worth', 'Dallas', 'West Texas', 'Commercial'];

  // Team key → team-lead display name (from the web org chart). The board shows
  // the lead's name instead of the raw team key.
  static const Map<String, String> _teamLeads = {
    'Gunner': 'Gunner McCullough',
    'Luke': 'Luke Huber',
    'Jonathan': 'Jonathan Chambers',
    'Mike Muscari': 'Mike Muscari',
    'Cooper': 'Cooper Bledsoe',
    'Daniel Sabedra': 'Daniel Sabedra',
  };
  static const List<String> _teamNames = ['Gunner', 'Luke', 'Jonathan', 'Mike Muscari', 'Cooper', 'Daniel Sabedra'];
  String _teamLabel(String team) => _teamLeads[team] ?? team;

  String _period = 'month';
  DateTime? _from;
  DateTime? _to;
  String _branch = '';
  String _team = '';
  bool _hideFormer = false;

  // Column sort (the mobile equivalent of the web's click-to-sort columns).
  String _sortKey = 'revenue';
  bool _sortDesc = true;
  static const _sortOptions = [
    {'key': 'revenue', 'label': 'Contract Amount'},
    {'key': 'won', 'label': 'Contracts'},
    {'key': 'filed', 'label': 'Claims Filed'},
    {'key': 'leadsCreated', 'label': 'Leads Created'},
    {'key': 'verifiedKnocks', 'label': 'Verified Knocks'},
    {'key': 'name', 'label': 'Rep (A–Z)'},
  ];

  List<dynamic> _rows = [];
  bool _loading = true;
  String? _userId;

  // Rep multi-select filter (deferred apply, like web): the committed set that
  // filters the table. The in-panel draft + search live inside the sheet.
  Set<String> _appliedReps = {};

  // Guided tour (Sales Leaderboard). Spotlight targets + one-per-user auto-start.
  final GlobalKey _kFilters = GlobalKey();
  final GlobalKey _kBoard = GlobalKey();
  final GlobalKey _kReplay = GlobalKey();
  bool _tourChecked = false;
  static const _tourSeenKey = 'tour_seen_sales_leaderboard_v1';

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

  // Every rep on the board (id -> name), de-duped and sorted by name, for the
  // rep multi-select. Stable across filters since it reads the raw rows.
  List<MapEntry<String, String>> get _repList {
    final seen = <String, String>{};
    for (final r in _rows) {
      final id = (r['id'] ?? '').toString();
      if (id.isEmpty) continue;
      seen.putIfAbsent(id, () => (r['name'] ?? 'Unknown Rep').toString());
    }
    final list = seen.entries.toList()
      ..sort((a, b) => a.value.toLowerCase().compareTo(b.value.toLowerCase()));
    return list;
  }

  List<Map<String, dynamic>> get _visibleRows {
    final branchActive = _branch.isNotEmpty;
    final list = <Map<String, dynamic>>[];
    for (final raw in _rows) {
      final r = Map<String, dynamic>.from(raw as Map);
      if (_hideFormer && r['former'] == true) continue;
      if (_appliedReps.isNotEmpty && !_appliedReps.contains((r['id'] ?? '').toString())) continue;
      if (branchActive) {
        final bb = r['byBranch'];
        final b = (bb is Map) ? bb[_branch] : null;
        if (b == null) continue;
        r['verifiedKnocks'] = b['verifiedKnocks'] ?? 0;
        r['leadsCreated'] = b['leadsCreated'] ?? 0; // scope Leads Created to the branch too (was showing all-branch)
        r['filed'] = b['filed'] ?? 0;
        r['won'] = b['won'] ?? 0;
        r['revenue'] = b['revenue'] ?? 0;
      }
      if (_team.isNotEmpty && (r['team'] ?? '').toString() != _team) continue;
      list.add(r);
    }
    // Sort by the chosen column, then fall back to overall standing.
    list.sort((a, b) {
      int cmp;
      if (_sortKey == 'name') {
        cmp = (a['name'] ?? '').toString().toLowerCase().compareTo((b['name'] ?? '').toString().toLowerCase());
      } else {
        num n(Map m, String k) => (m[k] is num) ? m[k] as num : 0;
        cmp = n(a, _sortKey).compareTo(n(b, _sortKey));
      }
      cmp = _sortDesc ? -cmp : cmp;
      if (cmp != 0) return cmp;
      return _standingCompare(a, b);
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

  String get _sortLabel => _sortOptions.firstWhere((o) => o['key'] == _sortKey)['label']!;

  // Overall standing tie-break: Contract Amount → Contracts → Claims Filed →
  // Leads Created → Verified Door Knocks (used to break ties after the chosen sort).
  int _standingCompare(Map a, Map b) {
    num n(Map m, String k) => (m[k] is num) ? m[k] as num : 0;
    for (final k in const ['revenue', 'won', 'filed', 'leadsCreated', 'verifiedKnocks']) {
      final c = n(b, k).compareTo(n(a, k));
      if (c != 0) return c;
    }
    return 0;
  }

  void _openSortSelector() {
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
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 14, 20, 4),
                child: Align(alignment: Alignment.centerLeft, child: Text('Sort by', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _textDark))),
              ),
              ..._sortOptions.map((o) {
                final sel = o['key'] == _sortKey;
                return ListTile(
                  title: Text(o['label']!, style: TextStyle(fontSize: 15, color: sel ? _primary : _textDark, fontWeight: sel ? FontWeight.w700 : FontWeight.w500)),
                  trailing: sel ? Icon(_sortDesc ? Icons.arrow_downward : Icons.arrow_upward, size: 18, color: _primary) : null,
                  onTap: () {
                    setState(() {
                      if (_sortKey == o['key']) {
                        _sortDesc = !_sortDesc; // tap the active one again to flip direction
                      } else {
                        _sortKey = o['key']!;
                        _sortDesc = o['key'] != 'name'; // numbers high→low, name A→Z
                      }
                    });
                    Navigator.pop(ctx);
                  },
                );
              }),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  // --- Compact filter bar: one "Filters" button + a bottom sheet ---------------

  // How many narrowing filters are active (period is always applied, so it isn't
  // counted here — it's shown in the summary text instead).
  int get _activeFilterCount {
    var n = 0;
    if (_branch.isNotEmpty) n++;
    if (_team.isNotEmpty) n++;
    if (_appliedReps.isNotEmpty) n++;
    if (_hideFormer) n++;
    return n;
  }

  // A short, human summary of what's applied, shown next to the Filters button.
  String get _filterSummary {
    final parts = <String>[_periodLabel];
    if (_branch.isNotEmpty) parts.add(_branch);
    if (_team.isNotEmpty) parts.add(_teamLabel(_team));
    if (_appliedReps.isNotEmpty) parts.add('${_appliedReps.length} reps');
    if (_hideFormer) parts.add('Active only');
    return parts.join(' · ');
  }

  void _resetFilters() {
    setState(() {
      _period = 'month';
      _from = null;
      _to = null;
      _branch = '';
      _team = '';
      _appliedReps = {};
      _hideFormer = false;
    });
    _fetch();
  }

  // The single compact bar that replaces the old chip grid: a "Filters" pill
  // (with an active-count badge) + a one-line summary of the current filters.
  Widget _filtersBar() {
    final active = _activeFilterCount > 0;
    return Row(
      children: [
        GestureDetector(
          onTap: _openFiltersSheet,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(
              color: active ? _primary : _bg,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: active ? _primary : _border),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.tune, size: 16, color: active ? _white : _textDark),
                const SizedBox(width: 6),
                Text('Filters',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: active ? _white : _textDark)),
                if (active) ...[
                  const SizedBox(width: 7),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                    decoration: BoxDecoration(color: _white, borderRadius: BorderRadius.circular(10)),
                    child: Text('$_activeFilterCount',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: _primary)),
                  ),
                ],
                const SizedBox(width: 4),
                Icon(Icons.keyboard_arrow_down, size: 17, color: active ? _white : _textLight),
              ],
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            _filterSummary,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12.5, color: _textLight, fontWeight: FontWeight.w500),
          ),
        ),
      ],
    );
  }

  // One row inside the Filters sheet: icon + label + current value + chevron.
  Widget _filterSheetRow(IconData icon, String label, String value, VoidCallback onTap) {
    return ListTile(
      leading: Icon(icon, color: _textLight, size: 22),
      title: Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _textDark)),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(child: Text(value, style: const TextStyle(fontSize: 13, color: _textLight), overflow: TextOverflow.ellipsis)),
          const Icon(Icons.chevron_right, color: _textPlaceholder, size: 20),
        ],
      ),
      onTap: onTap,
    );
  }

  void _openFiltersSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: _white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheet) {
            return SafeArea(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(height: 10),
                  Container(width: 40, height: 4, decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(2))),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 14, 12, 4),
                    child: Row(
                      children: [
                        const Text('Filters', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _textDark)),
                        const Spacer(),
                        if (_activeFilterCount > 0 || _period != 'month')
                          TextButton(
                            onPressed: () { _resetFilters(); setSheet(() {}); },
                            child: const Text('Reset', style: TextStyle(color: _primary, fontWeight: FontWeight.w600)),
                          ),
                      ],
                    ),
                  ),
                  // Tapping a value row closes this sheet and opens its own picker.
                  _filterSheetRow(Icons.date_range, 'Period', _periodLabel, () { Navigator.pop(ctx); _openPeriodSelector(); }),
                  _filterSheetRow(Icons.apartment_outlined, 'Branch', _branch.isEmpty ? 'All Branches' : _branch, () { Navigator.pop(ctx); _openBranchSelector(); }),
                  _filterSheetRow(Icons.groups_outlined, 'Team', _team.isEmpty ? 'All Teams' : _teamLabel(_team), () { Navigator.pop(ctx); _openTeamSelector(); }),
                  _filterSheetRow(Icons.person_outline, 'Reps', _appliedReps.isEmpty ? 'All Reps' : '${_appliedReps.length} selected', () { Navigator.pop(ctx); _openRepSelector(); }),
                  _filterSheetRow(Icons.sort, 'Sort by', '$_sortLabel ${_sortDesc ? "↓" : "↑"}', () { Navigator.pop(ctx); _openSortSelector(); }),
                  SwitchListTile(
                    value: _hideFormer,
                    activeColor: _primary,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                    secondary: const Icon(Icons.visibility_off_outlined, color: _textLight, size: 22),
                    title: const Text('Hide former reps', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _textDark)),
                    onChanged: (v) { setState(() => _hideFormer = v); setSheet(() {}); },
                  ),
                  const SizedBox(height: 10),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    // Wrap in ShowCaseWidget so the guided tour can spotlight elements. The
    // builder's context sits UNDER ShowCaseWidget, so ShowCaseWidget.of() works.
    return ShowCaseWidget(
      blurValue: 0.4,
      builder: (context) => _buildScaffold(context),
    );
  }

  Widget _buildScaffold(BuildContext context) {
    // Auto-start the tour once per user, after the board has loaded.
    if (!_loading && !_tourChecked) {
      _tourChecked = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _maybeAutoStartTour(context));
    }
    final visible = _visibleRows;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: _bg,
        body: SafeArea(
          child: Column(
            children: [
              Container(
                width: double.infinity,
                color: _white,
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Sales Rankings',
                                  style: TextStyle(color: _textDark, fontSize: 22, fontWeight: FontWeight.w800)),
                              SizedBox(height: 3),
                              Text('Live from AccuLynx + RepCard · refreshed hourly',
                                  style: TextStyle(color: _textLight, fontSize: 12.5)),
                            ],
                          ),
                        ),
                        Showcase(
                          key: _kReplay,
                          title: 'Replay anytime',
                          description: 'Tap here to replay this quick tour whenever you want a refresher.',
                          child: GestureDetector(
                            onTap: () => _startTour(context),
                            child: Container(
                              width: 34,
                              height: 34,
                              decoration: BoxDecoration(
                                color: _bg,
                                shape: BoxShape.circle,
                                border: Border.all(color: _border),
                              ),
                              child: const Icon(Icons.question_mark, size: 18, color: _textLight),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    TabBar(
                      labelColor: _primary,
                      unselectedLabelColor: _textLight,
                      indicatorColor: _primary,
                      labelStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                      unselectedLabelStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
                      tabs: const [
                        Tab(text: 'Leaderboard'),
                        Tab(text: 'Scoreboard'),
                      ],
                    ),
                  ],
                ),
              ),
              Expanded(
                child: TabBarView(
                  children: [
                    _buildLeaderboardTab(visible),
                    const ScoreboardScreen(),
                  ],
                ),
              ),
              _buildBottomNav(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLeaderboardTab(List<Map<String, dynamic>> visible) {
    return Column(
      children: [
        Container(
          width: double.infinity,
          color: _white,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Showcase(
                key: _kFilters,
                title: 'Filter the board',
                description: 'Pick a time period or a custom date range, or narrow the board to one branch, one team, or hide former reps.',
                child: _filtersBar(),
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
        _buildTotalsStats(),
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
                        itemBuilder: (context, i) {
                          final row = _row(visible[i], i);
                          // Spotlight the top row to explain the ranking.
                          if (i == 0) {
                            return Showcase(
                              key: _kBoard,
                              title: 'The live ranking',
                              description: 'Reps are ranked by contract amount for the selected period. Pull down to refresh.',
                              child: row,
                            );
                          }
                          return row;
                        },
                      ),
                    ),
        ),
        _buildTotalsSummary(),
      ],
    );
  }

  // Walk the tour down the screen: filters -> the board -> the replay button.
  void _startTour(BuildContext context) {
    final keys = <GlobalKey>[_kFilters];
    if (_visibleRows.isNotEmpty) keys.add(_kBoard);
    keys.add(_kReplay);
    ShowCaseWidget.of(context).startShowCase(keys);
  }

  // First visit only: run the tour once, then remember it per user/device.
  Future<void> _maybeAutoStartTour(BuildContext context) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool(_tourSeenKey) == true) return;
      await prefs.setBool(_tourSeenKey, true);
      if (!mounted) return;
      _startTour(context);
    } catch (_) {}
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
        options: [const MapEntry('', 'All Teams'), for (final t in _teamNames) MapEntry(t, _teamLabel(t))],
        onSelect: (v) => setState(() => _team = v),
      );

  // Rep multi-select sheet (mirrors the web panel): search + checkboxes with a
  // deferred apply — the table only changes on "Show Selected".
  void _openRepSelector() {
    final draft = Set<String>.from(_appliedReps);
    String search = '';
    showModalBottomSheet(
      context: context,
      backgroundColor: _white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
            child: StatefulBuilder(
              builder: (ctx, setSheet) {
                final reps = _repList
                    .where((rp) => rp.value.toLowerCase().contains(search.toLowerCase()))
                    .toList();
                void toggle(String id) => setSheet(() {
                      if (draft.contains(id)) {
                        draft.remove(id);
                      } else {
                        draft.add(id);
                      }
                    });
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(height: 10),
                    Container(width: 40, height: 4, decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(2))),
                    const Padding(
                      padding: EdgeInsets.fromLTRB(20, 14, 20, 8),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text('Filter by rep', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _textDark)),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: TextField(
                        onChanged: (v) => setSheet(() => search = v),
                        decoration: InputDecoration(
                          hintText: 'Search reps…',
                          hintStyle: const TextStyle(color: _textPlaceholder, fontSize: 14),
                          prefixIcon: const Icon(Icons.search, size: 20, color: _textLight),
                          isDense: true,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _border)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _border)),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _primary)),
                        ),
                      ),
                    ),
                    Flexible(
                      child: reps.isEmpty
                          ? const Padding(padding: EdgeInsets.all(24), child: Text('No reps found', style: TextStyle(color: _textPlaceholder)))
                          : ListView.builder(
                              shrinkWrap: true,
                              itemCount: reps.length,
                              itemBuilder: (c, i) {
                                final rp = reps[i];
                                final checked = draft.contains(rp.key);
                                return InkWell(
                                  onTap: () => toggle(rp.key),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                                    child: Row(
                                      children: [
                                        Checkbox(
                                          value: checked,
                                          activeColor: _primary,
                                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                          onChanged: (_) => toggle(rp.key),
                                        ),
                                        Expanded(child: Text(rp.value, style: const TextStyle(fontSize: 15, color: _textDark))),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                    ),
                    const Divider(height: 1, color: _border),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                      child: Row(
                        children: [
                          TextButton(
                            onPressed: () => setSheet(() => draft.clear()),
                            child: const Text('Clear', style: TextStyle(color: _textLight, fontWeight: FontWeight.w600)),
                          ),
                          const Spacer(),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _primary,
                              foregroundColor: _white,
                              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                            onPressed: () {
                              setState(() => _appliedReps = Set<String>.from(draft));
                              Navigator.pop(ctx);
                            },
                            child: Text('Show Selected (${draft.length})', style: const TextStyle(fontWeight: FontWeight.w700)),
                          ),
                        ],
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        );
      },
    );
  }

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
    final leads = r['leadsCreated'] ?? r['lead'] ?? 0;
    final subtitle = [branch, _teamLabel(team)].where((s) => s.isNotEmpty).join(' · ');

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
                _stat('Leads Created', '$leads'),
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

  num _sum(String k) => _visibleRows.fold<num>(0, (t, r) => t + ((r[k] is num) ? r[k] as num : 0));

  // Totals stat strip (Knocks / Leads / Claims / Contracts) — shown just under
  // the filters.
  Widget _buildTotalsStats() {
    if (_visibleRows.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      color: _white,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
      child: Row(
        children: [
          _totalStat('🚪 Knocks', _sum('verifiedKnocks')),
          _totalStat('Leads', _sum('leadsCreated')),
          _totalStat('Claims', _sum('filed')),
          _totalStat('Contracts', _sum('won')),
        ],
      ),
    );
  }

  // Rep count + total Contract Amount — pinned below the list (after all cards).
  Widget _buildTotalsSummary() {
    final rows = _visibleRows;
    if (rows.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: const BoxDecoration(color: _white, border: Border(top: BorderSide(color: _border))),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('${rows.length} rep${rows.length == 1 ? '' : 's'}',
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _textLight)),
          Text('Total ${_money(_sum('revenue'))}',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: _green)),
        ],
      ),
    );
  }

  Widget _totalStat(String label, num value) => Expanded(
        child: Column(
          children: [
            Text('${value.round()}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: _textDark)),
            Text(label, style: const TextStyle(fontSize: 10.5, color: _textLight), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      );

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
              _navItemActive(Icons.leaderboard_outlined, 'Sales'),
              _navItem(context, Icons.chat_bubble_outline, 'StormChat', false, '/stormchat'),
              _navItem(context, Icons.apps_outlined, 'Tools', false, '/apps-tools-items'),
              _navItem(context, Icons.school_outlined, 'Training', false, '/courses'),
              _navItem(context, Icons.person_outline, 'Profile', false, '/profile'),
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
