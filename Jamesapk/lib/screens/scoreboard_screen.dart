import 'package:flutter/material.dart';
import 'dart:convert';
import '../services/api_client.dart';

/// Standalone scoreboard widget. Works both as a full-screen route and as a
/// tab body inside an existing Scaffold (no inner Scaffold/AppBar when used
/// as a tab — just returns scrollable content).
class ScoreboardScreen extends StatefulWidget {
  const ScoreboardScreen({super.key});

  @override
  State<ScoreboardScreen> createState() => _ScoreboardScreenState();
}

class _ScoreboardScreenState extends State<ScoreboardScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Colors.white;
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFD1D5DB);
  static const _green = Color(0xFF16A34A);

  static const List<Map<String, String>> _windows = [
    {'key': 'day', 'label': 'Today'},
    {'key': 'week', 'label': 'Week to Date'},
    {'key': 'month', 'label': 'Month to Date'},
    {'key': 'year', 'label': 'Year to Date'},
  ];

  String _window = 'month';
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _data;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await api.get(
        Uri.parse('https://millerstorm.tech/api/scoreboard?window=$_window'),
      );
      if (res.statusCode == 200) {
        final parsed = json.decode(res.body) as Map<String, dynamic>;
        setState(() {
          _data = parsed;
          _loading = false;
        });
      } else {
        setState(() {
          _error = 'Failed to load scoreboard (${res.statusCode})';
          _loading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Could not reach server. Check your connection.';
        _loading = false;
      });
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  String _money(dynamic n) {
    final v = (n is num) ? n : num.tryParse('$n') ?? 0;
    final s = v.round().abs().toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
      buf.write(s[i]);
    }
    return '\$$buf';
  }

  String get _windowLabel =>
      _windows.firstWhere((w) => w['key'] == _window)['label']!;

  String _scopeTitle(String level) {
    switch (level) {
      case 'team':
        return 'Team Scoreboard';
      case 'branch':
        return 'Branch Scoreboard';
      case 'company':
        return 'Company Scoreboard';
      default:
        return 'My Scoreboard';
    }
  }

  // Trend arrow + pct text with colour. dir is "up", "down", "flat" or null.
  Widget _trendBadge(dynamic pct, dynamic dir) {
    final d = dir?.toString() ?? '';
    final p = (pct is num) ? pct : num.tryParse('$pct') ?? 0;
    if (d == 'up') {
      return Text('↑ ${p.round()}%',
          style: const TextStyle(
              fontSize: 12, fontWeight: FontWeight.w700, color: _green));
    } else if (d == 'down') {
      return Text('↓ ${p.round()}%',
          style: const TextStyle(
              fontSize: 12, fontWeight: FontWeight.w700, color: _primary));
    }
    return const Text('—',
        style: TextStyle(
            fontSize: 12, fontWeight: FontWeight.w500, color: _textPlaceholder));
  }

  Widget _conversionArrow(dynamic dir) {
    final d = dir?.toString() ?? '';
    if (d == 'up') {
      return const Icon(Icons.arrow_upward, size: 14, color: _green);
    } else if (d == 'down') {
      return const Icon(Icons.arrow_downward, size: 14, color: _primary);
    }
    return const SizedBox.shrink();
  }

  // ── Card widget helpers ───────────────────────────────────────────────────

  Widget _card({required Widget child, EdgeInsetsGeometry? padding}) {
    return Container(
      width: double.infinity,
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: child,
    );
  }

  // ── Window selector ───────────────────────────────────────────────────────

  Widget _windowSelector() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: _windows.map((w) {
          final active = w['key'] == _window;
          return GestureDetector(
            onTap: () {
              if (!active) {
                setState(() => _window = w['key']!);
                _fetch();
              }
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              margin: const EdgeInsets.only(right: 8),
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: active ? _primary : _white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: active ? _primary : _border),
              ),
              child: Text(
                w['label']!,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: active ? _white : _textDark,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  // ── Totals grid ───────────────────────────────────────────────────────────

  Widget _totalsGrid(Map<String, dynamic> totals, Map<String, dynamic>? trends) {
    Widget cell(String label, dynamic value, String trendKey,
        {bool isMoney = false}) {
      final trend = trends?[trendKey] as Map<String, dynamic>?;
      return Expanded(
        child: Container(
          margin: const EdgeInsets.all(4),
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
          decoration: BoxDecoration(
            color: _white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: const TextStyle(
                      fontSize: 12,
                      color: _textLight,
                      fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              Text(
                isMoney ? _money(value) : '${(value is num) ? value.round() : value}',
                style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: _textDark),
              ),
              const SizedBox(height: 4),
              _trendBadge(trend?['pct'], trend?['dir']),
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        Row(
          children: [
            cell('Revenue', totals['revenue'], 'revenue', isMoney: true),
            cell('Contracts', totals['contracts'], 'contracts'),
          ],
        ),
        Row(
          children: [
            cell('Knocks', totals['knocks'], 'knocks'),
            cell('Claims', totals['claims'], 'claims'),
          ],
        ),
      ],
    );
  }

  // ── Conversions row ───────────────────────────────────────────────────────

  Widget _conversionsRow(Map<String, dynamic> conversions) {
    Widget cell(String label, Map<String, dynamic> conv) {
      final hidden = conv['hidden'] == true;
      final rate = (conv['rate'] is num) ? (conv['rate'] as num).toDouble() : 0.0;
      final dir = conv['dir']?.toString() ?? '';
      return Expanded(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 4),
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
          decoration: BoxDecoration(
            color: _white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: const TextStyle(
                      fontSize: 11, color: _textLight, fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              Row(
                children: [
                  Text(
                    hidden ? '—' : '${rate.toStringAsFixed(1)}%',
                    style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: _textDark),
                  ),
                  const SizedBox(width: 4),
                  if (!hidden) _conversionArrow(dir),
                ],
              ),
            ],
          ),
        ),
      );
    }

    final k2c = conversions['knockToClaim'] as Map<String, dynamic>? ?? {};
    final c2con = conversions['claimToContract'] as Map<String, dynamic>? ?? {};

    return Row(
      children: [
        cell('Knock → Claim', k2c),
        cell('Claim → Contract', c2con),
      ],
    );
  }

  // ── Rank card ─────────────────────────────────────────────────────────────

  Widget _rankCard(Map<String, dynamic> rank) {
    final pos = rank['position'] ?? 0;
    final total = rank['total'] ?? 0;
    return _card(
      child: Row(
        children: [
          const Icon(Icons.emoji_events_outlined, color: _primary, size: 28),
          const SizedBox(width: 12),
          Text(
            '#$pos of $total reps',
            style: const TextStyle(
                fontSize: 18, fontWeight: FontWeight.w800, color: _textDark),
          ),
        ],
      ),
    );
  }

  // ── Pace bar ──────────────────────────────────────────────────────────────

  Widget _paceCard(double pace) {
    final pct = (pace * 100).round();
    final windowStr =
        _window[0].toUpperCase() + _window.substring(1); // e.g. "Month"
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('$windowStr Pace',
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: _textDark)),
              Text('$pct% through period',
                  style: const TextStyle(
                      fontSize: 13, color: _textLight, fontWeight: FontWeight.w500)),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: pace.clamp(0.0, 1.0),
              minHeight: 10,
              backgroundColor: _bg,
              valueColor: const AlwaysStoppedAnimation<Color>(_primary),
            ),
          ),
        ],
      ),
    );
  }

  // ── Goal card ─────────────────────────────────────────────────────────────

  Widget _goalCard(dynamic revenueAnnual) {
    return _card(
      child: Row(
        children: [
          const Icon(Icons.flag_outlined, color: _primary, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Annual Revenue Goal: ${_money(revenueAnnual)}',
              style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: _textDark),
            ),
          ),
        ],
      ),
    );
  }

  // ── Personal strip ────────────────────────────────────────────────────────

  Widget _personalStrip(Map<String, dynamic> personal) {
    final rev = personal['revenue'];
    final contracts = personal['contracts'] ?? 0;
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Your personal numbers:',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: _textLight)),
          const SizedBox(height: 8),
          Row(
            children: [
              Text(_money(rev),
                  style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: _textDark)),
              const SizedBox(width: 16),
              Text('$contracts contract${contracts == 1 ? '' : 's'}',
                  style: const TextStyle(
                      fontSize: 14,
                      color: _textLight,
                      fontWeight: FontWeight.w500)),
            ],
          ),
        ],
      ),
    );
  }

  // ── Header card ───────────────────────────────────────────────────────────

  Widget _headerCard(Map<String, dynamic> data) {
    final scope = data['scope'] as Map<String, dynamic>? ?? {};
    final level = scope['level']?.toString() ?? 'self';
    final count = (scope['count'] is int) ? scope['count'] as int : 0;
    final title = _scopeTitle(level);

    String subtitle = _windowLabel;
    if (count > 1) subtitle += ' · $count reps';

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 20, fontWeight: FontWeight.w800, color: _textDark)),
          const SizedBox(height: 4),
          Text(subtitle,
              style: const TextStyle(
                  fontSize: 13, color: _textLight, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }

  // ── Section label ─────────────────────────────────────────────────────────

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4),
        child: Text(text,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: _textPlaceholder,
                letterSpacing: 0.5)),
      );

  // ── Main build ────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Container(
      color: _bg,
      child: Column(
        children: [
          // Window selector strip (always visible)
          Container(
            width: double.infinity,
            color: _white,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: _windowSelector(),
          ),
          // Body
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(color: _primary))
                : _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.error_outline,
                                  size: 40, color: _textPlaceholder),
                              const SizedBox(height: 12),
                              Text(_error!,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                      color: _textLight, fontSize: 14)),
                              const SizedBox(height: 16),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                    backgroundColor: _primary,
                                    foregroundColor: _white),
                                onPressed: _fetch,
                                child: const Text('Retry'),
                              ),
                            ],
                          ),
                        ),
                      )
                    : _buildContent(),
          ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    final data = _data!;

    // Marketing / admin variant
    if (data['variant'] != null && data['scoreboard'] == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            'Scoreboard not available for your role.',
            textAlign: TextAlign.center,
            style: TextStyle(color: _textLight, fontSize: 16),
          ),
        ),
      );
    }

    final totals = data['totals'] as Map<String, dynamic>? ?? {};
    final trends = data['trends'] as Map<String, dynamic>?;
    final conversions = data['conversions'] as Map<String, dynamic>? ?? {};
    final scope = data['scope'] as Map<String, dynamic>? ?? {};
    final level = scope['level']?.toString() ?? 'self';
    final rank = data['rank'] as Map<String, dynamic>?;
    final pace = (data['pace'] is num)
        ? (data['pace'] as num).toDouble()
        : 0.0;
    final goals = data['goals'] as Map<String, dynamic>?;
    final revenueAnnual = goals?['revenueAnnual'];
    final personal = data['personal'] as Map<String, dynamic>?;

    return RefreshIndicator(
      color: _primary,
      onRefresh: _fetch,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
        children: [
          // Header
          _headerCard(data),
          const SizedBox(height: 12),

          // Totals
          _sectionLabel('TOTALS'),
          _totalsGrid(totals, trends),
          const SizedBox(height: 12),

          // Conversions
          _sectionLabel('CONVERSION RATES'),
          _conversionsRow(conversions),
          const SizedBox(height: 12),

          // Rank (only when scope is wider than self)
          if (rank != null && level != 'self') ...[
            _sectionLabel('RANKING'),
            _rankCard(rank),
            const SizedBox(height: 12),
          ],

          // Pace
          _sectionLabel('PERIOD PACE'),
          _paceCard(pace),
          const SizedBox(height: 12),

          // Annual Goal
          if (revenueAnnual != null) ...[
            _sectionLabel('GOAL'),
            _goalCard(revenueAnnual),
            const SizedBox(height: 12),
          ],

          // Personal strip (manager viewing their team/branch)
          if (personal != null) ...[
            _sectionLabel('PERSONAL'),
            _personalStrip(personal),
          ],
        ],
      ),
    );
  }
}
