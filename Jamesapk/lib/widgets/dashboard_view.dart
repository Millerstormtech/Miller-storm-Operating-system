import 'dart:convert';
import 'dart:ui' show FontFeature;
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../services/api_client.dart';

/// The role dashboard board (PR #67, mobile). ONE widget for every role — the
/// server (`GET /api/dashboard`) decides scope and returns everything in display
/// order; this only DRAWS it, never re-ranks or recomputes.
///
/// The breakdown row is the only part that changes identity:
///   company (c-level)     -> branches as cards
///   branch  (branch-mgr)  -> teams as cards      ("TEAM …")
///   team    (team-lead)   -> reps as a table
///   self    (sales rep)   -> their months as a table, cards carry `best`
///
/// Wrap this in a Scaffold with the panel's own bottom nav.
class DashboardView extends StatefulWidget {
  const DashboardView({super.key});

  @override
  State<DashboardView> createState() => _DashboardViewState();
}

class _DashboardViewState extends State<DashboardView> {
  static const _primary = Color(0xFFCB0002);
  static const _up = Color(0xFF16A34A);
  static const _down = Color(0xFFDC2626);

  bool _loading = true;
  bool _error = false;
  Map<String, dynamic>? _data;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() { _loading = true; _error = false; });
    try {
      final res = await api.get(Uri.parse('https://millerstorm.tech/api/dashboard'));
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        if (decoded is Map && decoded['dashboard'] != null) {
          setState(() { _data = Map<String, dynamic>.from(decoded['dashboard'] as Map); _loading = false; });
          return;
        }
        if (decoded is Map && decoded['hero'] != null) {
          setState(() { _data = Map<String, dynamic>.from(decoded); _loading = false; });
          return;
        }
        setState(() { _error = true; _loading = false; });
      } else {
        setState(() { _error = true; _loading = false; });
      }
    } catch (_) {
      // Never render an empty board on failure — a screen of zeroes reads as
      // "nobody sold anything", a worse claim than "this didn't load".
      if (mounted) setState(() { _error = true; _loading = false; });
    }
  }

  // ---- formatting -----------------------------------------------------------
  String _firstName(String full) {
    final t = full.trim();
    if (t.isEmpty) return 'there';
    return t.split(RegExp(r'\s+')).first;
  }

  String _money(dynamic n) => '\$${_grouped((n is num ? n : num.tryParse('$n') ?? 0).round())}';
  String _int(dynamic n) => _grouped((n is num ? n : num.tryParse('$n') ?? 0).round());
  String _grouped(int v) {
    final s = v.abs().toString();
    final b = StringBuffer(v < 0 ? '-' : '');
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
      b.write(s[i]);
    }
    return b.toString();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: _primary));
    if (_error) return _errorState();
    return RefreshIndicator(color: _primary, onRefresh: _fetch, child: _board());
  }

  Widget _errorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off, size: 44, color: AppColors.textPlaceholder),
            const SizedBox(height: 14),
            Text("Couldn't load the dashboard.",
                style: TextStyle(fontSize: 15, color: AppColors.textDark, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text('Pull to refresh, or try again in a moment.',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: AppColors.textLight)),
            const SizedBox(height: 18),
            OutlinedButton(onPressed: _fetch, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }

  Widget _board() {
    final d = _data!;
    final scope = (d['scope'] as Map?) ?? const {};
    final hero = (d['hero'] as Map?) ?? const {};
    final cards = (d['cards'] as Map?) ?? const {};
    final breakdown = (d['breakdown'] as Map?) ?? const {};
    final training = (d['training'] as Map?);
    final news = (d['news'] as List?);
    final rank = (d['rank'] as Map?);
    final avg = d['averageContract'];
    final monthRevenue = (cards['revenue'] as Map?)?['value'];

    final scopeLevel = (scope['level'] ?? '').toString();
    final scopeLabel = (scope['label'] ?? '').toString();
    final kind = (breakdown['kind'] ?? '').toString();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        // Greeting on the left, scope label on the right.
        Padding(
          padding: const EdgeInsets.only(bottom: 12, top: 4),
          child: Row(
            children: [
              Expanded(
                child: Text('Hi, ${_firstName((scope['viewer'] ?? '').toString())}',
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.textDark)),
              ),
              const SizedBox(width: 8),
              _kicker(scopeLabel.toUpperCase().isEmpty ? 'COMPANY' : scopeLabel.toUpperCase()),
            ],
          ),
        ),
        _heroCard(hero, rank, scopeLabel),
        const SizedBox(height: 14),
        _metricCard(title: 'REVENUE', card: cards['revenue'] as Map?, isMoney: true),
        const SizedBox(height: 14),
        _metricCard(
          title: 'CONTRACTS',
          card: cards['contracts'] as Map?,
          isMoney: false,
          subtitle: monthRevenue != null ? 'to reach ${_money(monthRevenue)}' : null,
          footer: (avg is num) ? 'Average contract ${_money(avg)}' : null,
          showTrend: false,
        ),
        const SizedBox(height: 14),
        _metricCard(title: 'CLAIMS', card: cards['claims'] as Map?, isMoney: false),
        const SizedBox(height: 14),
        _metricCard(title: 'VERIFIED KNOCKS', card: cards['knocks'] as Map?, isMoney: false),
        const SizedBox(height: 14),
        // Breakdown row — identity depends on kind.
        ..._breakdown(breakdown, kind),
        if (training != null) ...[
          _trainingCard(training, scopeLevel, scopeLabel),
          const SizedBox(height: 14),
        ],
        if (news != null && news.isNotEmpty) _newsCard(news),
      ],
    );
  }

  List<Widget> _breakdown(Map breakdown, String kind) {
    if (kind == 'branch' || kind == 'team') {
      final groups = (breakdown['groups'] as List?) ?? const [];
      return groups
          .map<Widget>((g) => Padding(padding: const EdgeInsets.only(bottom: 14), child: _groupCard(g as Map, kind)))
          .toList();
    }
    if (kind == 'rep') {
      final reps = (breakdown['reps'] as List?) ?? const [];
      return [if (reps.isNotEmpty) _repsCard(reps)];
    }
    if (kind == 'month') {
      final months = (breakdown['months'] as List?) ?? const [];
      return [if (months.isNotEmpty) _monthsCard(months)];
    }
    return const [];
  }

  // ---- shared bits ----------------------------------------------------------
  Text _kicker(String s, {Color? color, double size = 12}) => Text(
        s,
        style: TextStyle(fontSize: size, letterSpacing: 1.2, fontWeight: FontWeight.w700, color: color ?? AppColors.textLight),
      );

  Widget _card({required Widget child}) => Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border.withOpacity(0.6)),
        ),
        child: child,
      );

  TextStyle get _bigNum => TextStyle(
        fontSize: 34, fontWeight: FontWeight.w800, color: AppColors.textDark, height: 1.05,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  Widget _heroCard(Map hero, Map? rank, String scopeLabel) {
    final year = hero['year']?.toString() ?? '';
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _kicker('TOTAL REVENUE'),
                    const SizedBox(height: 3),
                    Text('Year to date $year', style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
                    const SizedBox(height: 8),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(_money(hero['revenue']), maxLines: 1, softWrap: false, style: _bigNum.copyWith(fontSize: 28)),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _kicker('TOTAL CONTRACTS'),
                  const SizedBox(height: 3),
                  Text('Year to date', style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
                  const SizedBox(height: 8),
                  Text(_int(hero['contracts']), maxLines: 1, softWrap: false, style: _bigNum.copyWith(fontSize: 26)),
                ],
              ),
            ],
          ),
          // Rank line (below c-level only): "Fort Worth is #2 of 3 by revenue…".
          if (rank != null && rank['rank'] != null && rank['of'] != null) ...[
            const SizedBox(height: 12),
            Divider(height: 1, color: AppColors.border.withOpacity(0.5)),
            const SizedBox(height: 12),
            RichText(
              text: TextSpan(
                style: TextStyle(fontSize: 14, color: AppColors.textLight),
                children: [
                  TextSpan(text: '${scopeLabel.isEmpty ? 'You' : scopeLabel} is '),
                  TextSpan(text: '#${rank['rank']}', style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.textDark)),
                  TextSpan(text: ' of ${rank['of']} by revenue this month'),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _metricCard({
    required String title,
    required Map? card,
    required bool isMoney,
    String? subtitle,
    String? footer,
    bool showTrend = true,
  }) {
    final value = card?['value'];
    final top = (card?['top'] as List?) ?? const [];
    final trend = card?['trend'] as Map?;
    final maxVal = top.isNotEmpty ? ((top.first as Map)['value'] as num?)?.toDouble() ?? 0 : 0.0;
    String fmt(dynamic v) => isMoney ? _money(v) : _int(v);

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _kicker(title),
          const SizedBox(height: 2),
          Text('Month to date', style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
          const SizedBox(height: 8),
          Text(fmt(value), style: _bigNum),
          const SizedBox(height: 4),
          if (showTrend && trend != null) _trendLine(trend),
          if (subtitle != null) Text(subtitle, style: TextStyle(fontSize: 13, color: AppColors.textLight)),
          const SizedBox(height: 12),
          Divider(height: 1, color: AppColors.border.withOpacity(0.5)),
          const SizedBox(height: 10),
          if (top.isEmpty)
            Text('Nobody yet', style: TextStyle(fontSize: 13, color: AppColors.textPlaceholder, fontStyle: FontStyle.italic))
          else
            ...top.asMap().entries.map((e) => _leaderRow(
                  rank: e.key + 1,
                  name: ((e.value as Map)['name'] ?? '').toString(),
                  valueText: fmt((e.value as Map)['value']),
                  fraction: maxVal > 0 ? (((e.value as Map)['value'] as num?)?.toDouble() ?? 0) / maxVal : 0,
                )),
          if (footer != null) ...[
            const SizedBox(height: 8),
            Text(footer, style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
          ],
        ],
      ),
    );
  }

  Widget _trendLine(Map trend) {
    final pct = trend['pct'];
    final dir = trend['dir']?.toString();
    if (pct == null || dir == null) return const SizedBox.shrink();
    if (dir == 'flat') {
      return Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: Text('same as last month', style: TextStyle(fontSize: 13, color: AppColors.textPlaceholder)),
      );
    }
    final up = dir == 'up';
    final n = (pct is num ? pct.abs() : 0).round();
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Text('$n% ${up ? 'above' : 'below'} last month',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: up ? _up : _down)),
    );
  }

  Widget _leaderRow({required int rank, required String name, required String valueText, required double fraction}) {
    final rankColor = rank == 1 ? _primary : AppColors.textPlaceholder;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SizedBox(width: 18, child: Text('$rank', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: rankColor))),
              const SizedBox(width: 6),
              Expanded(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.textDark))),
              const SizedBox(width: 8),
              Text(valueText, style: TextStyle(fontSize: 14, color: AppColors.textDark, fontFeatures: const [FontFeature.tabularFigures()])),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: fraction.clamp(0.0, 1.0),
              minHeight: 4,
              backgroundColor: AppColors.border.withOpacity(0.5),
              valueColor: const AlwaysStoppedAnimation<Color>(_primary),
            ),
          ),
        ],
      ),
    );
  }

  // Branch OR team card. Team gets a "TEAM …" prefix; branch is just the name.
  Widget _groupCard(Map g, String kind) {
    final name = (g['key'] ?? '').toString();
    final title = kind == 'team' ? 'TEAM ${name.toUpperCase()}' : name.toUpperCase();
    final totals = (g['totals'] as Map?) ?? const {};
    final yearTotals = (g['yearTotals'] as Map?) ?? const {};
    final leaders = (g['leaders'] as Map?) ?? const {};

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.textDark)),
          const SizedBox(height: 8),
          Divider(height: 1, color: AppColors.border.withOpacity(0.5)),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _yearMonthBlock('REVENUE', _money(yearTotals['revenue']), _money(totals['revenue']))),
              const SizedBox(width: 18),
              Expanded(child: _yearMonthBlock('CONTRACTS', _int(yearTotals['contracts']), _int(totals['contracts']))),
            ],
          ),
          const SizedBox(height: 12),
          Divider(height: 1, color: AppColors.border.withOpacity(0.5)),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _leaderMini('#1 REV', leaders['revenue'] as Map?, money: true)),
              const SizedBox(width: 12),
              Expanded(child: _leaderMini('#1 CLM', leaders['claims'] as Map?, money: false)),
              const SizedBox(width: 12),
              Expanded(child: _leaderMini('#1 KNK', leaders['knocks'] as Map?, money: false)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _yearMonthBlock(String label, String year, String month) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _kicker(label, size: 11),
          const SizedBox(height: 8),
          _labelValueRow('Year', year),
          const SizedBox(height: 6),
          _labelValueRow('Month', month),
        ],
      );

  Widget _labelValueRow(String label, String value) => Row(
        children: [
          Text(label, style: TextStyle(fontSize: 13, color: AppColors.textPlaceholder)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(value,
                textAlign: TextAlign.right, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.textDark, fontFeatures: const [FontFeature.tabularFigures()])),
          ),
        ],
      );

  Widget _leaderMini(String label, Map? leader, {required bool money}) {
    final name = leader?['name']?.toString();
    final value = leader?['value'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _kicker(label, size: 11, color: AppColors.textPlaceholder),
        const SizedBox(height: 8),
        if (name == null || name.isEmpty)
          Text('Nobody yet', style: TextStyle(fontSize: 13, color: AppColors.textPlaceholder, fontStyle: FontStyle.italic))
        else ...[
          Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textDark)),
          const SizedBox(height: 3),
          Text(money ? _money(value) : _int(value), style: TextStyle(fontSize: 13, color: AppColors.textLight, fontFeatures: const [FontFeature.tabularFigures()])),
        ],
      ],
    );
  }

  // Reps as a table (team-lead view). Former reps are marked, never hidden.
  Widget _repsCard(List reps) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _kicker('REPS'),
          const SizedBox(height: 12),
          _tableHeader(),
          const SizedBox(height: 6),
          ...reps.map((r) {
            final m = r as Map;
            return _tableRow(
              name: (m['name'] ?? '').toString(),
              former: m['former'] == true,
              cells: [_money(m['revenue']), _int(m['contracts']), _int(m['claims']), _int(m['knocks'])],
            );
          }),
        ],
      ),
    );
  }

  // Months as a table (rep view of their own history).
  Widget _monthsCard(List months) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _kicker('YOUR MONTHS'),
          const SizedBox(height: 12),
          _tableHeader(firstCol: 'MONTH'),
          const SizedBox(height: 6),
          ...months.map((mo) {
            final m = mo as Map;
            return _tableRow(
              name: (m['label'] ?? '').toString(),
              former: false,
              cells: [_money(m['revenue']), _int(m['contracts']), _int(m['claims']), _int(m['knocks'])],
            );
          }),
        ],
      ),
    );
  }

  Widget _tableHeader({String firstCol = 'REP'}) => Row(
        children: [
          Expanded(flex: 4, child: _kicker(firstCol, size: 10)),
          Expanded(flex: 3, child: Align(alignment: Alignment.centerRight, child: _kicker('REV', size: 10))),
          Expanded(flex: 2, child: Align(alignment: Alignment.centerRight, child: _kicker('CON', size: 10))),
          Expanded(flex: 2, child: Align(alignment: Alignment.centerRight, child: _kicker('CLM', size: 10))),
          Expanded(flex: 2, child: Align(alignment: Alignment.centerRight, child: _kicker('KNK', size: 10))),
        ],
      );

  Widget _tableRow({required String name, required bool former, required List<String> cells}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          children: [
            Expanded(
              flex: 4,
              child: Row(
                children: [
                  Flexible(
                    child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textDark)),
                  ),
                  if (former) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(color: AppColors.surfaceAlt, borderRadius: BorderRadius.circular(4)),
                      child: Text('former', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: AppColors.textLight)),
                    ),
                  ],
                ],
              ),
            ),
            ...cells.asMap().entries.map((e) => Expanded(
                  flex: e.key == 0 ? 3 : 2,
                  child: Text(e.value,
                      textAlign: TextAlign.right, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: AppColors.textDark, fontFeatures: const [FontFeature.tabularFigures()])),
                )),
          ],
        ),
      );

  Widget _trainingCard(Map training, String scopeLevel, String scopeLabel) {
    final pct = training['pct'];
    final headcount = training['headcount'];
    final top = (training['top'] as List?) ?? const [];
    final where = scopeLevel != 'company' && scopeLabel.isNotEmpty ? ' in $scopeLabel' : '';
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _kicker('TRAINING CENTER'),
          const SizedBox(height: 3),
          Text('average across ${_int(headcount)} reps$where', style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
          const SizedBox(height: 8),
          Text('${(pct is num ? pct.round() : 0)}%', style: _bigNum),
          const SizedBox(height: 12),
          Divider(height: 1, color: AppColors.border.withOpacity(0.5)),
          const SizedBox(height: 10),
          if (top.isEmpty)
            Text('Nobody yet', style: TextStyle(fontSize: 13, color: AppColors.textPlaceholder, fontStyle: FontStyle.italic))
          else
            ...top.asMap().entries.map((e) {
              final m = e.value as Map;
              final p = (m['pct'] is num) ? (m['pct'] as num).toDouble() : 0.0;
              return _leaderRow(rank: e.key + 1, name: (m['name'] ?? '').toString(), valueText: '${p.round()}%', fraction: p / 100);
            }),
        ],
      ),
    );
  }

  Widget _newsCard(List news) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _kicker('NEWS'),
          const SizedBox(height: 3),
          Text('Last 7 days', style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
          const SizedBox(height: 12),
          ...news.map((n) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      margin: const EdgeInsets.only(top: 6, right: 10),
                      width: 6, height: 6,
                      decoration: const BoxDecoration(color: _primary, shape: BoxShape.circle),
                    ),
                    Expanded(child: Text(((n as Map)['text'] ?? '').toString(), style: TextStyle(fontSize: 14, height: 1.35, color: AppColors.textDark))),
                  ],
                ),
              )),
        ],
      ),
    );
  }
}
