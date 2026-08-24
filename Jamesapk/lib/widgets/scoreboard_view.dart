import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'dart:convert';
import '../services/api_client.dart';
import '../theme/app_theme.dart';

// Sales Scoreboard — a faithful port of the web ScoreboardHome (/api/scoreboard).
// Greeting, rank strip, Week/Month/Year toggle, three metric tiles (value +
// honest trend + goal bar with pace notch), an optional personal strip, and the
// freshness note. Rendered inside the "My Dashboard" tab of the Sales
// Leaderboard page. The C-level dashboard also passes showPodiums, adding the
// Top 3 Sales + Top 3 Training strip (parity with the web PodiumStrip).
class ScoreboardView extends StatefulWidget {
  // Called by the "Full Sales Leaderboard" link to switch back to the board tab.
  final VoidCallback? onOpenLeaderboard;
  // C-level dashboard shows Top 3 Sales + Top 3 Training podiums under the board.
  // Every other role passes false and is completely unaffected.
  final bool showPodiums;
  const ScoreboardView({super.key, this.onOpenLeaderboard, this.showPodiums = false});

  @override
  State<ScoreboardView> createState() => _ScoreboardViewState();
}

class _ScoreboardViewState extends State<ScoreboardView> {
  Color get _white => AppColors.surface;
  static const _primary = Color(0xFFCB0002);
  Color get _textDark => AppColors.textDark;
  Color get _textLight => AppColors.textLight;
  Color get _textPlaceholder => AppColors.textPlaceholder;
  Color get _border => AppColors.border;
  static const _green = Color(0xFF10B981);
  static const _red = Color(0xFFDC2626);
  static const _neutral = Color(0xFF6B7280);
  Color get _track => AppColors.border;
  Color get _notch => AppColors.textDark;
  static const _link = Color(0xFF2563EB);

  String _window = 'month';
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _error = false;
  String _firstName = 'there';

  // C-level podiums (parity with web PodiumStrip). Sales follows the Week/Month/
  // Year toggle; training is all-time and fetched once.
  List<dynamic>? _salesPodium;
  bool _salesPodiumLoading = false;
  bool _salesPodiumError = false;
  List<dynamic>? _trainingPodium;
  bool _trainingPodiumError = false;

  @override
  void initState() {
    super.initState();
    _loadName();
    _fetch();
    if (widget.showPodiums) {
      _fetchSalesPodium();
      _fetchTrainingPodium();
    }
  }

  Future<void> _loadName() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        final name = (user['name'] ?? '').toString().trim();
        if (name.isNotEmpty && mounted) {
          setState(() => _firstName = name.split(RegExp(r'\s+')).first);
        }
      }
    } catch (_) {}
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      // Send the logged-in user's id, matching the web ScoreboardHome. The server
      // honors userId only for admins (for everyone else it's their own id, a
      // no-op), so this keeps the app in step with the web /api/scoreboard call.
      String userId = '';
      try {
        final prefs = await SharedPreferences.getInstance();
        final userStr = prefs.getString('user');
        if (userStr != null) userId = (jsonDecode(userStr)['id'] ?? '').toString();
      } catch (_) {}
      final res = await api
          .get(Uri.parse('https://millerstorm.tech/api/scoreboard?window=$_window&userId=${Uri.encodeComponent(userId)}'))
          .timeout(const Duration(seconds: 20));
      if (res.statusCode == 200) {
        final json = jsonDecode(res.body) as Map<String, dynamic>;
        if (mounted) {
          setState(() {
            _data = json;
            _loading = false;
          });
        }
      } else {
        if (mounted) setState(() { _error = true; _loading = false; });
      }
    } catch (_) {
      if (mounted) setState(() { _error = true; _loading = false; });
    }
  }

  void _setWindow(String w) {
    if (w == _window) return;
    setState(() => _window = w);
    _fetch();
    // Sales podium follows the toggle; training is all-time, so it stays put.
    if (widget.showPodiums) _fetchSalesPodium();
  }

  Future<void> _fetchSalesPodium() async {
    setState(() {
      _salesPodiumLoading = true;
      _salesPodiumError = false;
    });
    final w = _window;
    try {
      final res = await api
          .get(Uri.parse('https://millerstorm.tech/api/scoreboard/podiums?window=$w'))
          .timeout(const Duration(seconds: 20));
      // A slow "year" response must never overwrite a newer toggle's result.
      if (!mounted || w != _window) return;
      if (res.statusCode == 200) {
        final json = jsonDecode(res.body) as Map<String, dynamic>;
        setState(() {
          _salesPodium = (json['sales'] as List?) ?? const [];
          _salesPodiumLoading = false;
        });
      } else {
        setState(() {
          _salesPodiumError = true;
          _salesPodiumLoading = false;
        });
      }
    } catch (_) {
      if (mounted && w == _window) {
        setState(() {
          _salesPodiumError = true;
          _salesPodiumLoading = false;
        });
      }
    }
  }

  Future<void> _fetchTrainingPodium() async {
    try {
      // Reuse the board's own company top-three flag (isPodium) so this strip can
      // never disagree with the Course Leaderboard screen.
      final res = await api
          .get(Uri.parse('https://millerstorm.tech/api/training/leaderboard?scope=overall'))
          .timeout(const Duration(seconds: 20));
      if (!mounted) return;
      if (res.statusCode == 200) {
        final json = jsonDecode(res.body) as Map<String, dynamic>;
        final rows = (json['rows'] as List?) ?? const [];
        setState(() => _trainingPodium = rows.where((r) => r['isPodium'] == true).take(3).toList());
      } else {
        setState(() => _trainingPodiumError = true);
      }
    } catch (_) {
      if (mounted) setState(() => _trainingPodiumError = true);
    }
  }

  // ── Formatting helpers (ported from src/lib/scoreboard/display.ts) ──────────
  String _thousands(int v) {
    final neg = v < 0;
    final s = v.abs().toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
      buf.write(s[i]);
    }
    return '${neg ? '-' : ''}$buf';
  }

  String _fmtMoney(num n) => '\$${_thousands((n.isFinite ? n : 0).round())}';
  String _fmtCount(num n) => _thousands((n.isFinite ? n : 0).round());


  // value/goal as 0..1, or null when no goal is set (renders no bar).
  double? _barFill(num value, num? goal) {
    if (goal == null) return null;
    if (goal <= 0) return 1;
    final frac = value / goal;
    if (!frac.isFinite) return 1;
    return frac.clamp(0.0, 1.0).toDouble();
  }

  double _paceNotch(num pace) => pace.clamp(0.0, 1.0).toDouble();

  String? _trendLabel(num? pct, String? dir) {
    if (dir == null || pct == null) return null;
    const labels = {
      'day': 'vs yesterday',
      'week': 'vs last week',
      'month': 'vs last month',
      'year': 'vs last year',
    };
    return '${pct.abs().round()}% ${labels[_window] ?? 'vs last month'}';
  }

  String _contractsSubtitle(num contracts) {
    final c = contracts.round();
    return 'across ${_fmtCount(c)} contract${c == 1 ? '' : 's'}';
  }

  String? _scopeLine(Map scope) {
    if (scope['level'] == 'self') return null;
    final count = (scope['count'] as num?)?.toInt() ?? 0;
    final who = count == 1 ? 'person' : 'people';
    final countPart = '${_fmtCount(count)} $who contributed';
    final label = (scope['label'] ?? '').toString();
    return label.isNotEmpty ? '$label · $countPart' : countPart;
  }

  String _absDate(DateTime d) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[d.month - 1]} ${d.day}, ${d.year}';
  }

  String _formatSyncedAt(String? syncedAt) {
    if (syncedAt == null) return 'Sales data: last sync time unknown';
    final synced = DateTime.tryParse(syncedAt);
    if (synced == null) return 'Sales data: last sync time unknown';
    final diff = DateTime.now().difference(synced);
    if (diff.isNegative) return 'Sales data last synced ${_absDate(synced)}';
    final minutes = diff.inMinutes;
    if (minutes < 1) return 'Sales data synced less than a minute ago';
    if (minutes < 60) return 'Sales data synced $minutes minute${minutes == 1 ? '' : 's'} ago';
    final hours = diff.inHours;
    if (hours < 24) return 'Sales data synced $hours hour${hours == 1 ? '' : 's'} ago';
    final days = diff.inDays;
    if (days < 7) return 'Sales data synced $days day${days == 1 ? '' : 's'} ago';
    return 'Sales data last synced ${_absDate(synced)}';
  }

  // ── Pieces ──────────────────────────────────────────────────────────────────
  BoxDecoration get _card => BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _border),
      );

  Widget _windowToggle() {
    const opts = [
      ['week', 'Week'],
      ['month', 'Month'],
      ['year', 'Year'],
    ];
    return Row(
      children: opts.map((o) {
        final active = _window == o[0];
        return Padding(
          padding: const EdgeInsets.only(right: 8),
          child: GestureDetector(
            onTap: () => _setWindow(o[0]),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              decoration: BoxDecoration(
                color: active ? _textDark : _white,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: active ? _textDark : _border),
              ),
              child: Text(o[1],
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: active ? _white : _textLight)),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget? _rankStrip(Map? rank, String scopeLevel) {
    if (rank == null) return null;
    final pos = _fmtCount((rank['rank'] as num?) ?? 0);
    final pool = _fmtCount((rank['of'] as num?) ?? 0);
    final text = scopeLevel == 'self'
        ? '#$pos of $pool reps'
        : scopeLevel == 'team'
            ? 'Team #$pos of $pool'
            : scopeLevel == 'branch'
                ? 'Branch #$pos of $pool'
                : null;
    if (text == null) return null;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      decoration: _card,
      child: Text(text, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _textDark)),
    );
  }

  Widget _goalBar(double fill, double notch) {
    return LayoutBuilder(builder: (context, c) {
      final w = c.maxWidth;
      return SizedBox(
        height: 8,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Container(decoration: BoxDecoration(color: _track, borderRadius: BorderRadius.circular(999))),
            FractionallySizedBox(
              widthFactor: fill,
              child: Container(decoration: BoxDecoration(color: _green, borderRadius: BorderRadius.circular(999))),
            ),
            Positioned(
              left: (w * notch).clamp(0.0, w - 2),
              top: -2,
              bottom: -2,
              child: Container(width: 2, color: _notch),
            ),
          ],
        ),
      );
    });
  }

  Widget _metricTile({
    required String label,
    required num value,
    required String format,
    String? subtitle,
    num? goal,
    required num pace,
    required Map trend,
  }) {
    final formatted = format == 'money' ? _fmtMoney(value) : _fmtCount(value);
    final fill = _barFill(value, goal);
    final notch = goal != null ? _paceNotch(pace) : null;
    final dir = trend['dir'] as String?;
    final pct = trend['pct'] as num?;
    final trendText = _trendLabel(pct, dir);
    final trendColor = dir == 'up' ? _green : dir == 'down' ? _red : _neutral;
    final trendArrow = dir == 'up' ? '▲' : dir == 'down' ? '▼' : dir == 'flat' ? '●' : null;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: _card,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _textLight, letterSpacing: 0.5)),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(formatted, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: _textDark)),
              if (trendArrow != null && trendText != null) ...[
                const SizedBox(width: 8),
                Text('$trendArrow $trendText',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: trendColor)),
              ],
            ],
          ),
          if (subtitle != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(subtitle, style: TextStyle(fontSize: 12, color: _textPlaceholder)),
            ),
          if (goal != null && fill != null && notch != null) ...[
            const SizedBox(height: 10),
            _goalBar(fill, notch),
            const SizedBox(height: 4),
            Text('${(fill * 100).round()}% of ${format == 'money' ? _fmtMoney(goal) : _fmtCount(goal)} goal',
                style: TextStyle(fontSize: 11, color: _textPlaceholder)),
          ],
        ],
      ),
    );
  }

  Widget _personalNumber(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 11, color: _textPlaceholder)),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _textDark)),
      ],
    );
  }

  Widget _personalStrip(Map personal) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: _card,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('YOU (PERSONAL)',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _textLight, letterSpacing: 0.5)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 24,
            runSpacing: 8,
            children: [
              _personalNumber('Revenue', _fmtMoney((personal['revenue'] as num?) ?? 0)),
              _personalNumber('Verified Door Knocks', _fmtCount((personal['knocks'] as num?) ?? 0)),
              _personalNumber('Claims Filed', _fmtCount((personal['claims'] as num?) ?? 0)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _tryAgain(String prefix, double fontSize) {
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text(prefix, style: TextStyle(color: _textLight, fontSize: fontSize)),
        GestureDetector(
          onTap: _fetch,
          child: Text('Try again',
              style: TextStyle(color: _link, fontSize: fontSize, fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    // First load, nothing to show yet.
    if (_data == null && _loading) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Text('Loading your scoreboard…', style: TextStyle(color: _textLight, fontSize: 14)),
      );
    }
    if (_data == null) {
      return Padding(padding: const EdgeInsets.all(24), child: _tryAgain("Couldn't load your scoreboard. ", 14));
    }

    final data = _data!;
    // Marketing/admin variant — a sales rep never hits this, but stay honest.
    if (data['variant'] != null) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Hi, $_firstName', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: _textDark)),
            const SizedBox(height: 12),
            Text("This account doesn't have scoreboard metrics of its own to show.",
                style: TextStyle(fontSize: 14, color: _textLight)),
          ],
        ),
      );
    }

    final scope = (data['scope'] as Map?) ?? const {};
    final scopeLevel = (scope['level'] ?? 'self').toString();
    final resolved = scope['resolved'] != false;
    final totals = (data['totals'] as Map?) ?? const {};
    final goals = (data['goals'] as Map?) ?? const {};
    final trends = (data['trends'] as Map?) ?? const {};
    final rank = data['rank'] as Map?;
    final pace = (data['pace'] as num?) ?? 0;
    final contracts = (data['contracts'] as num?) ?? 0;
    final personal = data['personal'] as Map?;
    final scopeText = _scopeLine(scope);
    final rankWidget = _rankStrip(rank, scopeLevel);
    final scopeUnresolved = (scopeLevel == 'team' || scopeLevel == 'branch') && !resolved;

    return RefreshIndicator(
      color: _primary,
      onRefresh: _fetch,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Hi, $_firstName', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: _textDark)),
          const SizedBox(height: 16),
          if (rankWidget != null) rankWidget,
          _windowToggle(),
          const SizedBox(height: 12),
          if (scopeUnresolved)
            Text(
              "We couldn't match your account to a ${scopeLevel == 'team' ? 'team' : 'branch'} on the org chart, "
              "so there's nothing to show yet. Check your profile, or ask an admin to confirm your "
              "${scopeLevel == 'team' ? 'team' : 'branch'}.",
              style: TextStyle(fontSize: 14, color: _textLight),
            )
          else ...[
            if (scopeText != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(scopeText, style: TextStyle(fontSize: 13, color: _textLight)),
              ),
            if (_loading)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text('Updating your numbers…', style: TextStyle(color: _textPlaceholder, fontSize: 13)),
              )
            else if (_error)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: _tryAgain("Couldn't update your numbers. ", 13),
              )
            else ...[
              _metricTile(
                label: 'Revenue',
                value: (totals['revenue'] as num?) ?? 0,
                format: 'money',
                subtitle: _contractsSubtitle(contracts),
                goal: goals['revenue'] as num?,
                pace: pace,
                trend: (trends['revenue'] as Map?) ?? const {},
              ),
              _metricTile(
                label: 'Verified Door Knocks',
                value: (totals['knocks'] as num?) ?? 0,
                format: 'count',
                goal: goals['knocks'] as num?,
                pace: pace,
                trend: (trends['knocks'] as Map?) ?? const {},
              ),
              _metricTile(
                label: 'Claims Filed',
                value: (totals['claims'] as num?) ?? 0,
                format: 'count',
                goal: goals['claims'] as num?,
                pace: pace,
                trend: (trends['claims'] as Map?) ?? const {},
              ),
              if (personal != null) _personalStrip(personal),
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 12),
                child: Text(_formatSyncedAt(data['syncedAt'] as String?),
                    style: TextStyle(fontSize: 12, color: _textPlaceholder)),
              ),
              if (widget.onOpenLeaderboard != null)
                GestureDetector(
                  onTap: widget.onOpenLeaderboard,
                  child: const Text('Full Sales Leaderboard',
                      style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w700, color: _link, decoration: TextDecoration.underline)),
                ),
              if (widget.showPodiums) ...[
                const SizedBox(height: 18),
                _podiumSection(),
              ],
            ],
          ],
        ],
      ),
    );
  }

  // ---- C-level podiums (Top 3 Sales + Top 3 Training) ----

  Widget _podiumSection() {
    final windowCaption = _window == 'week'
        ? 'This week'
        : _window == 'year'
            ? 'This year'
            : 'This month';

    final salesRows = (_salesPodium ?? const []).map<Map<String, dynamic>>((p) {
      return {
        'place': (p['place'] as num?)?.toInt() ?? 0,
        'name': (p['name'] ?? '').toString(),
        'headshotUrl': (p['headshotUrl'] ?? '').toString(),
        'value': _fmtMoney((p['revenue'] as num?) ?? 0),
      };
    }).toList();

    var ti = 0;
    final trainingRows = (_trainingPodium ?? const []).map<Map<String, dynamic>>((r) {
      ti++;
      return {
        'place': (r['rank'] as num?)?.toInt() ?? ti,
        'name': (r['name'] ?? '').toString(),
        'headshotUrl': (r['headshotUrl'] ?? '').toString(),
        'value': '${_fmtCount((r['itemsCompleted'] as num?) ?? 0)} lessons',
      };
    }).toList();

    return Column(
      children: [
        _podiumCard(
          title: 'Top 3 in Sales',
          caption: windowCaption,
          loading: _salesPodiumLoading,
          error: _salesPodiumError,
          // An empty period early in the week is a real, honest state, not a
          // failure — it gets its own wording rather than a blank card.
          emptyMessage: 'No contracts recorded yet for this period.',
          rows: salesRows,
          linkLabel: 'Full Sales Leaderboard',
          onLink: widget.onOpenLeaderboard,
        ),
        const SizedBox(height: 12),
        _podiumCard(
          title: 'Top 3 in Training',
          caption: 'All time',
          // Says plainly why this half does not move with the toggle.
          note:
              'Lifetime standing, so this does not change with the period. Lesson completions were not dated before August 2026.',
          loading: _trainingPodium == null && !_trainingPodiumError,
          error: _trainingPodiumError,
          emptyMessage: 'No one has started a course yet.',
          rows: trainingRows,
        ),
      ],
    );
  }

  Widget _podiumCard({
    required String title,
    required String caption,
    String? note,
    required bool loading,
    required bool error,
    required String emptyMessage,
    required List<Map<String, dynamic>> rows,
    String? linkLabel,
    VoidCallback? onLink,
  }) {
    Widget body;
    if (loading) {
      body = Text('Loading…', style: TextStyle(fontSize: 13, color: _textLight));
    } else if (error) {
      // Never fall through to an empty podium on a failed request: three blank
      // medals would falsely claim "nobody is winning".
      body = Text("Couldn't load this right now.", style: TextStyle(fontSize: 13, color: _textLight));
    } else if (rows.isEmpty) {
      body = Text(emptyMessage, style: TextStyle(fontSize: 13, color: _textLight));
    } else {
      body = Column(children: rows.map(_podiumRow).toList());
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: _card,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title.toUpperCase(),
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w700, color: _textLight, letterSpacing: 0.5)),
          const SizedBox(height: 2),
          Text(caption, style: TextStyle(fontSize: 12, color: _textPlaceholder)),
          const SizedBox(height: 12),
          body,
          if (note != null) ...[
            const SizedBox(height: 10),
            Text(note, style: TextStyle(fontSize: 11.5, color: _textPlaceholder, height: 1.4)),
          ],
          if (linkLabel != null && onLink != null) ...[
            const SizedBox(height: 10),
            GestureDetector(
              onTap: onLink,
              child: Text(linkLabel,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w700, color: _link, decoration: TextDecoration.underline)),
            ),
          ],
        ],
      ),
    );
  }

  Widget _podiumRow(Map<String, dynamic> row) {
    final place = row['place'] as int;
    final name = row['name'] as String;
    final value = row['value'] as String;
    final img = row['headshotUrl'] as String;

    const medals = <int, List<Color>>{
      1: [Color(0xFFFFE488), Color(0xFFE8B923)],
      2: [Color(0xFFE9EDF2), Color(0xFFB9C0C9)],
      3: [Color(0xFFF0B98A), Color(0xFFCD7F45)],
    };
    final grad = medals[place] ?? [_border, _border];

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(colors: grad, begin: Alignment.topLeft, end: Alignment.bottomRight),
            ),
            alignment: Alignment.center,
            child: Text('$place',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Color(0xFF3A2400))),
          ),
          const SizedBox(width: 10),
          Container(
            width: 32,
            height: 32,
            decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF374151)),
            clipBehavior: Clip.antiAlias,
            alignment: Alignment.center,
            child: img.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: img.startsWith('http') ? img : 'https://millerstorm.tech$img',
                    fit: BoxFit.cover,
                    width: 32,
                    height: 32,
                    errorWidget: (_, __, ___) => _podiumInitial(name),
                  )
                : _podiumInitial(name),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _textDark)),
          ),
          const SizedBox(width: 8),
          Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: _textDark)),
        ],
      ),
    );
  }

  Widget _podiumInitial(String name) {
    final letter = name.trim().isNotEmpty ? name.trim()[0].toUpperCase() : '?';
    return Text(letter, style: TextStyle(color: _white, fontSize: 14, fontWeight: FontWeight.w700));
  }
}
