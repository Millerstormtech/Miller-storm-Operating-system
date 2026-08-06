import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../services/api_client.dart';

// Sales Scoreboard — a faithful port of the web ScoreboardHome (/api/scoreboard).
// Greeting, rank strip, Week/Month/Year toggle, three metric tiles (value +
// honest trend + goal bar with pace notch), the two funnel conversion rates, an
// optional personal strip, and the freshness note. Rendered inside the
// "My Dashboard" tab of the Sales Leaderboard page.
class ScoreboardView extends StatefulWidget {
  // Called by the "Full Sales Leaderboard" link to switch back to the board tab.
  final VoidCallback? onOpenLeaderboard;
  const ScoreboardView({super.key, this.onOpenLeaderboard});

  @override
  State<ScoreboardView> createState() => _ScoreboardViewState();
}

class _ScoreboardViewState extends State<ScoreboardView> {
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFE5E7EB);
  static const _green = Color(0xFF10B981);
  static const _red = Color(0xFFDC2626);
  static const _neutral = Color(0xFF6B7280);
  static const _track = Color(0xFFE5E7EB);
  static const _notch = Color(0xFF111827);
  static const _link = Color(0xFF2563EB);

  String _window = 'month';
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _error = false;
  String _firstName = 'there';

  @override
  void initState() {
    super.initState();
    _loadName();
    _fetch();
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
      final res = await api
          .get(Uri.parse('https://millerstorm.tech/api/scoreboard?window=$_window'))
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

  String _fmtRate(num rate) {
    final pct = rate.isFinite ? rate * 100 : 0.0;
    final decimals = pct.abs() < 10 ? 1 : 0;
    return '${pct.toStringAsFixed(decimals)}%';
  }

  String _fmtConversion(num rate, bool hidden) =>
      hidden ? 'not enough data yet' : _fmtRate(rate);

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
      child: Text(text, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _textDark)),
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
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _textLight, letterSpacing: 0.5)),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(formatted, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: _textDark)),
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
              child: Text(subtitle, style: const TextStyle(fontSize: 12, color: _textPlaceholder)),
            ),
          if (goal != null && fill != null && notch != null) ...[
            const SizedBox(height: 10),
            _goalBar(fill, notch),
            const SizedBox(height: 4),
            Text('${(fill * 100).round()}% of ${format == 'money' ? _fmtMoney(goal) : _fmtCount(goal)} goal',
                style: const TextStyle(fontSize: 11, color: _textPlaceholder)),
          ],
        ],
      ),
    );
  }

  Widget _conversionCell(String label, Map cell) {
    final rate = (cell['rate'] as num?) ?? 0;
    final hidden = cell['hidden'] == true;
    final dir = cell['dir'] as String?;
    final text = _fmtConversion(rate, hidden);
    final color = dir == 'up' ? _green : dir == 'down' ? _red : _neutral;
    final arrow = dir == 'up' ? '▲' : dir == 'down' ? '▼' : dir == 'flat' ? '●' : null;
    final word = dir == 'up' ? 'up' : dir == 'down' ? 'down' : dir == 'flat' ? 'flat' : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(),
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _textLight, letterSpacing: 0.5)),
        const SizedBox(height: 4),
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Flexible(
              child: Text(text,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _textDark),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            if (arrow != null && word != null) ...[
              const SizedBox(width: 6),
              Text('$arrow $word', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
            ],
          ],
        ),
      ],
    );
  }

  Widget _conversionStrip(Map ktc, Map ctc) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: _card,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: _conversionCell('knock to claim', ktc)),
          const SizedBox(width: 16),
          Expanded(child: _conversionCell('claim to contract', ctc)),
        ],
      ),
    );
  }

  Widget _personalNumber(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 11, color: _textPlaceholder)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _textDark)),
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
          const Text('YOU (PERSONAL)',
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
      return const Padding(
        padding: EdgeInsets.all(24),
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
            Text('Hi, $_firstName', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: _textDark)),
            const SizedBox(height: 12),
            const Text("This account doesn't have scoreboard metrics of its own to show.",
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
    final conversions = (data['conversions'] as Map?) ?? const {};
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
          Text('Hi, $_firstName', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: _textDark)),
          const SizedBox(height: 16),
          if (rankWidget != null) rankWidget,
          _windowToggle(),
          const SizedBox(height: 12),
          if (scopeUnresolved)
            Text(
              "We couldn't match your account to a ${scopeLevel == 'team' ? 'team' : 'branch'} on the org chart, "
              "so there's nothing to show yet. Check your profile, or ask an admin to confirm your "
              "${scopeLevel == 'team' ? 'team' : 'branch'}.",
              style: const TextStyle(fontSize: 14, color: _textLight),
            )
          else ...[
            if (scopeText != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(scopeText, style: const TextStyle(fontSize: 13, color: _textLight)),
              ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
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
              _conversionStrip(
                (conversions['knockToClaim'] as Map?) ?? const {},
                (conversions['claimToContract'] as Map?) ?? const {},
              ),
              if (personal != null) _personalStrip(personal),
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 12),
                child: Text(_formatSyncedAt(data['syncedAt'] as String?),
                    style: const TextStyle(fontSize: 12, color: _textPlaceholder)),
              ),
              if (widget.onOpenLeaderboard != null)
                GestureDetector(
                  onTap: widget.onOpenLeaderboard,
                  child: const Text('Full Sales Leaderboard',
                      style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w700, color: _link, decoration: TextDecoration.underline)),
                ),
            ],
          ],
        ],
      ),
    );
  }
}
