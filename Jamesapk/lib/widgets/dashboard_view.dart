import 'dart:convert';
import 'dart:ui' show FontFeature;
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/app_theme.dart';
import '../services/api_client.dart';
import '../services/dashboard_links.dart';
import '../services/crowning.dart';
import 'notification_bell.dart';
import 'celebration.dart';

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
  String? _userId;
  final GlobalKey<NotificationBellState> _bellKey = GlobalKey<NotificationBellState>();

  // The one celebration on screen right now, if any — crowning ceremony or
  // "your contracts rose", never both at once. Port of RoleDashboard.tsx's
  // moment effect: crowning takes priority, and only a rep (scope "self")
  // ever gets the contracts moment (a leader's number is the whole branch).
  MomentCopy? _moment;

  @override
  void initState() {
    super.initState();
    _loadUserId();
    _fetch();
  }

  Future<void> _loadUserId() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        if (mounted) setState(() => _userId = (user['id'] ?? user['_id'])?.toString());
      }
    } catch (_) {}
  }

  Future<void> _fetch() async {
    setState(() { _loading = true; _error = false; });
    // Pull-to-refresh should also refresh the bell's unread count — it
    // otherwise only ever fetches once, in its own initState. Fire-and-forget
    // so a slow notifications call never delays the dashboard board itself.
    _bellKey.currentState?.refresh();
    try {
      final res = await api.get(Uri.parse('https://millerstorm.tech/api/dashboard'));
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        Map<String, dynamic>? data;
        if (decoded is Map && decoded['dashboard'] != null) {
          data = Map<String, dynamic>.from(decoded['dashboard'] as Map);
        } else if (decoded is Map && decoded['hero'] != null) {
          data = Map<String, dynamic>.from(decoded);
        }
        if (data != null) {
          setState(() { _data = data; _loading = false; });
          _computeMoment(data);
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

  // Port of RoleDashboard.tsx's celebration effect. "Seen" state lives in
  // SharedPreferences (the mobile equivalent of localStorage) — device-scoped,
  // wrapped so a read/write failure never breaks the dashboard.
  Future<void> _computeMoment(Map<String, dynamic> data) async {
    SharedPreferences? prefs;
    try {
      prefs = await SharedPreferences.getInstance();
    } catch (_) {
      return;
    }

    final crowning = Crowning.fromJson(data['crowning'] as Map?);
    final seenMonth = prefs.getString('ms-crowning-seen');
    if (shouldCelebrateCrowning(crowning, seenMonth)) {
      try { await prefs.setString('ms-crowning-seen', crowning!.month); } catch (_) {}
      if (mounted) setState(() => _moment = crowningCopy(crowning!));
      return; // crowning takes priority; contracts-risen is skipped this run
    }

    final scope = (data['scope'] as Map?) ?? const {};
    if ((scope['level'] ?? '') != 'self') return; // leaders excluded
    final viewer = (scope['viewer'] ?? '').toString();
    final hero = (data['hero'] as Map?) ?? const {};
    final contracts = (hero['contracts'] is num) ? hero['contracts'] as num : num.tryParse('${hero['contracts']}') ?? 0;
    final key = 'ms-hero-contracts:$viewer';
    final stored = prefs.getString(key);
    final previous = stored == null ? null : num.tryParse(stored);
    final gained = contractsGained(previous, contracts);
    try { await prefs.setString(key, '$contracts'); } catch (_) {}
    if (gained > 0 && mounted) setState(() => _moment = contractCopy(gained, contracts));
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
    return Stack(
      children: [
        RefreshIndicator(color: _primary, onRefresh: _fetch, child: _board()),
        if (_moment != null)
          Positioned.fill(
            child: WinMoment(
              mark: _moment!.mark,
              title: _moment!.title,
              line: _moment!.line,
              onClose: () => setState(() => _moment = null),
            ),
          ),
      ],
    );
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
    final lowestKnocks = (d['lowestKnocks'] as Map?);

    final scopeLevel = (scope['level'] ?? '').toString();
    final scopeLabel = (scope['label'] ?? '').toString();
    final scopeTeam = (scope['team'] ?? '').toString();
    final scopeBranch = (scope['branch'] ?? '').toString();
    final scopeFilter = scopeFilterFor(level: scopeLevel, branch: scopeBranch, team: scopeTeam);
    final kind = (breakdown['kind'] ?? '').toString();
    // Managers only — the API never sends it to a rep, and a card with nobody
    // on it is not drawn (same guard the web uses).
    final lowest = (lowestKnocks != null && (lowestKnocks['reps'] as List?)?.isNotEmpty == true) ? lowestKnocks : null;
    // The chip on the right of the greeting. A rep's scope label is empty by
    // design (the server never names a rep's own scope), so a rep shows their
    // team — "TEAM GUNNER" — instead of the "COMPANY" fallback the top level uses.
    final chipText = scopeLevel == 'self'
        ? (scopeTeam.isNotEmpty ? 'TEAM ${scopeTeam.toUpperCase()}' : 'MY TEAM')
        : (scopeLabel.trim().isNotEmpty ? scopeLabel.toUpperCase() : 'COMPANY');
    // A rep (self scope) has nobody below them, so each card carries their own
    // best finished month instead of a top-3 podium — same as the web.
    final isSelf = scopeLevel == 'self';
    final best = (breakdown['best'] as Map?);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        // Menu on the left (opens this screen's Scaffold drawer — every role
        // wraps DashboardView in its own Scaffold(drawer: ...), so this one
        // button works for all of them), greeting, scope label on the right.
        Padding(
          padding: const EdgeInsets.only(bottom: 12, top: 4),
          child: Row(
            children: [
              Builder(
                builder: (context) => IconButton(
                  icon: Icon(Icons.menu, color: AppColors.textDark),
                  tooltip: 'Menu',
                  onPressed: () => Scaffold.of(context).openDrawer(),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Text('Hi, ${_firstName((scope['viewer'] ?? '').toString())}',
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.textDark)),
              ),
              const SizedBox(width: 8),
              if (_userId != null) ...[
                NotificationBell(key: _bellKey, userId: _userId!),
                const SizedBox(width: 8),
              ],
              _kicker(chipText),
            ],
          ),
        ),
        _heroCard(
          hero,
          rank,
          scopeLabel,
          scopeLevel,
          isSelf: isSelf,
          onSeeAllYear: () => _openRankings(scopeLevel: scopeLevel, window: 'year', sort: 'revenue', filter: scopeFilter, focus: 'me'),
          // The rank compares against everyone, so its link drops the scope
          // filter and opens the whole board.
          onSeeAllRank: () => _openRankings(scopeLevel: scopeLevel, window: 'month', sort: 'revenue', focus: 'me'),
        ),
        const SizedBox(height: 14),
        for (final metric in const ['revenue', 'contracts', 'claims', 'knocks']) ...[
          _metricCard(
            title: _metricTitle[metric]!,
            card: cards[metric] as Map?,
            isMoney: metric == 'revenue',
            isSelf: isSelf,
            best: best?[metric] as Map?,
            onSeeAll: () => _openRankings(
              scopeLevel: scopeLevel,
              window: 'month',
              sort: metricSort(metric),
              filter: scopeFilter,
              focus: 'me',
            ),
          ),
          const SizedBox(height: 14),
        ],
        // Lowest Knocks: C-Level reads it here, before the branch cards.
        if (lowest != null && scopeLevel == 'company') ...[
          _lowestKnocksCard(lowest, scopeLevel: scopeLevel, filter: scopeFilter),
          const SizedBox(height: 14),
        ],
        // Breakdown row — identity depends on kind.
        ..._breakdown(breakdown, kind, scopeLevel: scopeLevel, scopeFilter: scopeFilter),
        if (training != null) ...[
          _trainingCard(
            training,
            scopeLevel,
            scopeLabel,
            onSeeAll: () => isSelf
                ? Navigator.pushNamed(context, trainingRoute(scopeLevel))
                : Navigator.pushNamed(
                    context,
                    trainingRoute(scopeLevel),
                    arguments: TrainingLinkArgs(branch: scopeFilter['branch'], team: scopeFilter['team']),
                  ),
          ),
          const SizedBox(height: 14),
        ],
        if (news != null && news.isNotEmpty) _newsCard(news),
        // Branch Manager and Team Lead get it at the very bottom; a rep never
        // sees it (the API sends null there).
        if (lowest != null && scopeLevel != 'company')
          _lowestKnocksCard(lowest, scopeLevel: scopeLevel, filter: scopeFilter),
      ],
    );
  }

  static const Map<String, String> _metricTitle = {
    'revenue': 'REVENUE',
    'contracts': 'CONTRACTS',
    'claims': 'CLAIMS',
    'knocks': 'VERIFIED KNOCKS',
  };

  void _openRankings({
    required String scopeLevel,
    String? window,
    String? from,
    String? to,
    required String sort,
    bool desc = true,
    Map<String, String>? filter,
    String? focus,
  }) {
    Navigator.pushNamed(
      context,
      rankingsRoute(scopeLevel),
      arguments: RankingsLinkArgs(
        window: window,
        from: from,
        to: to,
        sort: sort,
        desc: desc,
        branch: filter?['branch'],
        team: filter?['team'],
        // Every link scrolls to the viewer's own row unless it names someone
        // else — mirrors salesLink()'s own `opts.focus ?? 'me'` on the web, so
        // a call site can never forget this the way the Lowest Knocks
        // "See all" link almost did.
        focus: focus ?? 'me',
      ),
    );
  }

  List<Widget> _breakdown(Map breakdown, String kind, {required String scopeLevel, required Map<String, String> scopeFilter}) {
    if (kind == 'branch' || kind == 'team') {
      final groups = (breakdown['groups'] as List?) ?? const [];
      if (groups.isEmpty) {
        return [_emptyCard('No ${kind == 'branch' ? 'branches' : 'teams'} have numbers this month yet.')];
      }
      return groups
          .map<Widget>((g) => Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: _groupCard(g as Map, kind, scopeLevel: scopeLevel),
              ))
          .toList();
    }
    if (kind == 'rep') {
      final reps = (breakdown['reps'] as List?) ?? const [];
      if (reps.isEmpty) return [_emptyCard('Nobody on this team has numbers this month yet.')];
      return [
        _repsCard(
          reps,
          onSeeAll: () => _openRankings(scopeLevel: scopeLevel, window: 'month', sort: 'revenue', filter: scopeFilter, focus: 'me'),
        ),
      ];
    }
    if (kind == 'month') {
      final months = (breakdown['months'] as List?) ?? const [];
      if (months.isEmpty) return [_emptyCard('No months to show yet — this is your first.')];
      return [
        _monthsCard(
          months,
          onSeeAll: () => _openRankings(scopeLevel: scopeLevel, window: 'month', sort: 'revenue', focus: 'me'),
          onOpenMonth: (monthKey, isCurrent) {
            if (isCurrent) {
              _openRankings(scopeLevel: scopeLevel, window: 'month', sort: 'revenue', focus: 'me');
            } else {
              final range = monthRangeFor(monthKey);
              _openRankings(scopeLevel: scopeLevel, from: range['from'], to: range['to'], sort: 'revenue', focus: 'me');
            }
          },
        ),
      ];
    }
    return const [];
  }

  Widget _emptyCard(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: _card(child: Text(text, style: TextStyle(fontSize: 14, color: AppColors.textLight))),
      );

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

  // Opens whatever leaderboard/course-leaderboard the tapped number is drawn
  // from, on the same period, sorted the same way, scoped to the viewer (or
  // whichever branch/team the card belongs to) — see dashboard_links.dart.
  Widget _seeAll(VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 2),
          child: Text('See all  ›', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _primary)),
        ),
      );

  // A card's title/subtitle on the left, "See all" on the right — every
  // card's own header uses this so the link always sits in the same place.
  Widget _cardHead(String title, String sub, {VoidCallback? onSeeAll}) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _kicker(title),
                const SizedBox(height: 2),
                Text(sub, style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
              ],
            ),
          ),
          if (onSeeAll != null) ...[const SizedBox(width: 10), _seeAll(onSeeAll)],
        ],
      );

  TextStyle get _bigNum => TextStyle(
        fontSize: 34, fontWeight: FontWeight.w800, color: AppColors.textDark, height: 1.05,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  Widget _heroCard(
    Map hero,
    Map? rank,
    String scopeLabel,
    String scopeLevel, {
    required bool isSelf,
    required VoidCallback onSeeAllYear,
    required VoidCallback onSeeAllRank,
  }) {
    final year = hero['year']?.toString() ?? '';
    final avgContract = hero['averageContract'];
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
                    _kicker(isSelf ? 'MY REVENUE' : 'TOTAL REVENUE'),
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
                  _kicker(isSelf ? 'MY CONTRACTS' : 'TOTAL CONTRACTS'),
                  const SizedBox(height: 3),
                  Text('Year to date $year', style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
                  const SizedBox(height: 8),
                  Text(_int(hero['contracts']), maxLines: 1, softWrap: false, style: _bigNum.copyWith(fontSize: 26)),
                ],
              ),
            ],
          ),
          // Year-to-date average contract — hidden entirely with no contracts
          // yet this year (null), same guard the server uses.
          const SizedBox(height: 12),
          Divider(height: 1, color: AppColors.border.withOpacity(0.5)),
          const SizedBox(height: 11),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: avgContract is num
                    ? RichText(
                        text: TextSpan(
                          style: TextStyle(fontSize: 13, color: AppColors.textLight),
                          children: [
                            TextSpan(text: isSelf ? 'My average contract ' : 'Average contract '),
                            TextSpan(text: _money(avgContract), style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.textDark, fontFeatures: const [FontFeature.tabularFigures()])),
                            const TextSpan(text: ' year to date'),
                          ],
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
              const SizedBox(width: 10),
              _seeAll(onSeeAllYear),
            ],
          ),
          // Rank line (below c-level only): "Fort Worth is #2 of 3 by revenue…".
          if (rank != null && rank['rank'] != null && rank['of'] != null) ...[
            const SizedBox(height: 11),
            Divider(height: 1, color: AppColors.border.withOpacity(0.5)),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: RichText(
                    text: TextSpan(
                      style: TextStyle(fontSize: 14, color: AppColors.textLight),
                      children: [
                        TextSpan(text: scopeLevel == 'self' ? 'You are ' : '${scopeLabel.isEmpty ? 'You' : scopeLabel} is '),
                        TextSpan(text: '#${rank['rank']}', style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.textDark)),
                        TextSpan(text: ' of ${rank['of']} by revenue this month'),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                _seeAll(onSeeAllRank),
              ],
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
    bool showTrend = true,
    bool isSelf = false,
    Map? best,
    required VoidCallback onSeeAll,
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
          _cardHead(title, 'Month to date', onSeeAll: onSeeAll),
          const SizedBox(height: 8),
          Text(fmt(value), style: _bigNum),
          const SizedBox(height: 4),
          if (showTrend) _trendLine(trend),
          if (subtitle != null) Text(subtitle, style: TextStyle(fontSize: 13, color: AppColors.textLight)),
          const SizedBox(height: 12),
          Divider(height: 1, color: AppColors.border.withOpacity(0.5)),
          const SizedBox(height: 10),
          if (isSelf)
            _bestSlot(best, fmt)
          else if (top.isEmpty)
            Text('Nobody yet', style: TextStyle(fontSize: 13, color: AppColors.textPlaceholder, fontStyle: FontStyle.italic))
          else
            ...top.asMap().entries.map((e) => _leaderRow(
                  rank: e.key + 1,
                  name: ((e.value as Map)['name'] ?? '').toString(),
                  valueText: fmt((e.value as Map)['value']),
                  fraction: maxVal > 0 ? (((e.value as Map)['value'] as num?)?.toDouble() ?? 0) / maxVal : 0,
                )),
        ],
      ),
    );
  }

  // Matches the web exactly: "N% vs last month", with the direction shown by
  // colour (green up / red down / muted flat); when there's no prior month to
  // compare against, the web shows "No comparison yet" — see display.ts.
  Widget _trendLine(Map? trend) {
    final pct = trend?['pct'];
    final dir = trend?['dir']?.toString();
    if (pct == null || dir == null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: Text('No comparison yet', style: TextStyle(fontSize: 13, color: AppColors.textPlaceholder)),
      );
    }
    final n = (pct is num ? pct.abs() : 0).round();
    final color = dir == 'up' ? _up : dir == 'down' ? _down : AppColors.textPlaceholder;
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Text('$n% vs last month',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color)),
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
          GrowingBar(pct: fraction.clamp(0.0, 1.0) * 100, height: 4),
        ],
      ),
    );
  }

  // A slim bar (no name row) used by the rep's "Best month" slot and by the
  // training credentials. Grows into place once on first build instead of
  // snapping to its value (PR #77).
  Widget _miniBar(double fraction) => GrowingBar(pct: fraction.clamp(0.0, 1.0) * 100, height: 4);

  // The rep's own best finished month, shown where a manager's card shows the
  // top-3 podium — matches the web MetricCard's showBest branch.
  Widget _bestSlot(Map? best, String Function(dynamic) fmt) {
    if (best == null) {
      return Text('No finished month to compare yet',
          style: TextStyle(fontSize: 13, color: AppColors.textPlaceholder));
    }
    final pct = (best['pct'] is num) ? (best['pct'] as num).toDouble() : 0.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(child: Text('Best month, ${best['label'] ?? ''}', style: TextStyle(fontSize: 13, color: AppColors.textLight))),
            const SizedBox(width: 8),
            Text(fmt(best['value']),
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.textDark, fontFeatures: const [FontFeature.tabularFigures()])),
          ],
        ),
        const SizedBox(height: 8),
        _miniBar(pct / 100),
      ],
    );
  }

  // Branch OR team card. Team gets a "TEAM …" prefix; branch is just the name.
  Widget _groupCard(Map g, String kind, {required String scopeLevel}) {
    final name = (g['key'] ?? '').toString();
    final title = kind == 'team' ? 'TEAM ${name.toUpperCase()}' : name.toUpperCase();
    final totals = (g['totals'] as Map?) ?? const {};
    final yearTotals = (g['yearTotals'] as Map?) ?? const {};
    final leaders = (g['leaders'] as Map?) ?? const {};
    // This card's own filter: whichever branch or team it's for, regardless
    // of the viewer's own scope.
    final filter = kind == 'team' ? {'team': name} : {'branch': name};
    void openMonth(String sort) => _openRankings(scopeLevel: scopeLevel, window: 'month', sort: sort, filter: filter, focus: 'me');

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(title, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.textDark))),
              const SizedBox(width: 10),
              _seeAll(() => openMonth('revenue')),
            ],
          ),
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
              Expanded(child: _leaderMini('#1 REV', leaders['revenue'] as Map?, money: true, onSeeAll: () => openMonth('revenue'))),
              const SizedBox(width: 12),
              Expanded(child: _leaderMini('#1 CLM', leaders['claims'] as Map?, money: false, onSeeAll: () => openMonth('filed'))),
              const SizedBox(width: 12),
              Expanded(child: _leaderMini('#1 KNK', leaders['knocks'] as Map?, money: false, onSeeAll: () => openMonth('verifiedKnocks'))),
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

  Widget _leaderMini(String label, Map? leader, {required bool money, VoidCallback? onSeeAll}) {
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
        if (onSeeAll != null) ...[const SizedBox(height: 4), _seeAll(onSeeAll)],
      ],
    );
  }

  // A zero renders as "–", never "0" — the table is about who did something.
  String _dash(dynamic v, {required bool money}) {
    final n = (v is num ? v : num.tryParse('$v') ?? 0);
    if (n == 0) return '–';
    return money ? _money(n) : _int(n);
  }

  // Reps as a table (team-lead view). Former reps are marked, never hidden.
  Widget _repsCard(List reps, {required VoidCallback onSeeAll}) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _cardHead('MY REPS', '${reps.length} ${reps.length == 1 ? 'person' : 'people'}, month to date, highest revenue first', onSeeAll: onSeeAll),
          const SizedBox(height: 12),
          _tableHeader(),
          const SizedBox(height: 2),
          // Rep rows are not tappable — only the card's own "See all" links out.
          ...reps.asMap().entries.map((e) {
            final m = e.value as Map;
            return _tableRow(
              index: e.key,
              name: (m['name'] ?? '').toString(),
              former: m['former'] == true,
              cells: [_dash(m['revenue'], money: true), _dash(m['contracts'], money: false), _dash(m['claims'], money: false), _dash(m['knocks'], money: false)],
            );
          }),
        ],
      ),
    );
  }

  // Months as a table (rep view of their own history). Each month row opens
  // that calendar month on the board; the current-month row opens the same
  // as "See all" (this month, not a fixed custom range that goes stale).
  Widget _monthsCard(List months, {required VoidCallback onSeeAll, required void Function(String monthKey, bool isCurrent) onOpenMonth}) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _cardHead('MY MONTHS', 'This year, newest first', onSeeAll: onSeeAll),
          const SizedBox(height: 12),
          _tableHeader(firstCol: 'MONTH'),
          const SizedBox(height: 2),
          ...months.asMap().entries.map((e) {
            final m = e.value as Map;
            final isCurrent = e.key == 0; // newest row = the month in progress
            return _tableRow(
              index: e.key,
              name: (m['label'] ?? '').toString(),
              former: false,
              thisMonth: isCurrent,
              cells: [_dash(m['revenue'], money: true), _dash(m['contracts'], money: false), _dash(m['claims'], money: false), _dash(m['knocks'], money: false)],
              onTap: () => onOpenMonth((m['key'] ?? '').toString(), isCurrent),
            );
          }),
        ],
      ),
    );
  }

  Widget _tableHeader({String firstCol = 'REP'}) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          children: [
            Expanded(flex: 5, child: _kicker(firstCol, size: 10)),
            Expanded(flex: 4, child: Align(alignment: Alignment.centerRight, child: _kicker('REV', size: 10))),
            Expanded(flex: 2, child: Align(alignment: Alignment.centerRight, child: _kicker('CON', size: 10))),
            Expanded(flex: 2, child: Align(alignment: Alignment.centerRight, child: _kicker('CLM', size: 10))),
            Expanded(flex: 2, child: Align(alignment: Alignment.centerRight, child: _kicker('KNK', size: 10))),
          ],
        ),
      );

  Widget _tableRow({
    required int index,
    required String name,
    required bool former,
    required List<String> cells,
    bool thisMonth = false,
    VoidCallback? onTap,
  }) {
    final row = Container(
      color: index.isOdd ? AppColors.surfaceAlt.withOpacity(0.5) : null,
      padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 4),
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: Row(
              children: [
                Flexible(
                  child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w700,
                        color: onTap != null ? _primary : AppColors.textDark,
                        decoration: onTap != null ? TextDecoration.underline : null,
                        decorationColor: AppColors.border,
                      )),
                ),
                if (thisMonth) ...[
                  const SizedBox(width: 7),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(color: _primary, borderRadius: BorderRadius.circular(6)),
                    child: const Text('THIS MONTH', style: TextStyle(fontSize: 8.5, letterSpacing: 0.5, fontWeight: FontWeight.w800, color: Colors.white)),
                  ),
                ],
                if (former) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(color: AppColors.border.withOpacity(0.5), borderRadius: BorderRadius.circular(4)),
                    child: Text('FORMER', style: TextStyle(fontSize: 8.5, letterSpacing: 0.5, fontWeight: FontWeight.w700, color: AppColors.textLight)),
                  ),
                ],
              ],
            ),
          ),
          ...cells.asMap().entries.map((e) => Expanded(
                flex: e.key == 0 ? 4 : 2,
                child: Text(e.value,
                    textAlign: TextAlign.right, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13, color: AppColors.textDark, fontFeatures: const [FontFeature.tabularFigures()])),
              )),
        ],
      ),
    );
    if (onTap == null) return row;
    return GestureDetector(onTap: onTap, behavior: HitTestBehavior.opaque, child: row);
  }

  Widget _trainingCard(Map training, String scopeLevel, String scopeLabel, {required VoidCallback onSeeAll}) {
    final pct = training['pct'];
    final headcount = training['headcount'];
    final top = (training['top'] as List?) ?? const [];
    final credentials = (training['credentials'] as List?);
    final isSelf = scopeLevel == 'self';
    // Matches the web: subtitle is "{scope}, all time" (or "My progress, all
    // time" for a rep), and the line under the % is "average course completion
    // across N reps" (or "of the whole library finished" for a rep).
    final sub = isSelf ? 'My progress, all time' : '${scopeLabel.isEmpty ? 'Company' : scopeLabel}, all time';
    final n = _int(headcount);
    final below = isSelf
        ? 'of the whole library finished'
        : 'average course completion across $n ${n == '1' ? 'rep' : 'reps'}';
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _cardHead('TRAINING CENTER', sub, onSeeAll: onSeeAll),
          const SizedBox(height: 8),
          Text('${(pct is num ? pct.round() : 0)}%', style: _bigNum),
          const SizedBox(height: 4),
          Text(below, style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
          const SizedBox(height: 12),
          Divider(height: 1, color: AppColors.border.withOpacity(0.5)),
          const SizedBox(height: 10),
          // A rep sees their own credentials (Certification / Knockers /
          // Hustlers); a manager sees the training top-3 — matches the web.
          if (isSelf && credentials != null && credentials.isNotEmpty)
            ...credentials.map((c) => _credentialRow(c as Map))
          else if (top.isEmpty)
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

  static const Map<String, String> _credentialLabel = {
    'certificate': 'Miller Storm Certification',
    'knockers': 'Millionaire Knockers',
    'hustlers': 'Roof Hustlers',
  };

  Widget _credentialRow(Map c) {
    final key = (c['key'] ?? '').toString();
    final earned = c['earned'] == true;
    final p = (c['pct'] is num) ? (c['pct'] as num).toDouble() : 0.0;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(_credentialLabel[key] ?? key, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.textDark))),
              const SizedBox(width: 8),
              Text(earned ? 'Earned' : '${p.round()}%',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: earned ? _up : AppColors.textLight, fontFeatures: const [FontFeature.tabularFigures()])),
            ],
          ),
          const SizedBox(height: 6),
          _miniBar(earned ? 1.0 : p / 100),
        ],
      ),
    );
  }

  static const List<String> _monthAbbr = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  /// "2026-09-06" -> "Sep 6".
  String _fmtDay(String isoDay) {
    final parts = isoDay.split('-');
    if (parts.length != 3) return isoDay;
    final m = int.tryParse(parts[1]) ?? 1;
    final d = int.tryParse(parts[2]) ?? 1;
    return '${_monthAbbr[(m - 1).clamp(0, 11)]} $d';
  }

  // Managers only — the bottom 3 by verified knocks over the last 7 complete
  // days. See all and each name open the same window, sorted lowest-knocks
  // first, filtered to the viewer's scope; tapping a name also focuses that
  // row so the rankings screen scrolls to and outlines it.
  Widget _lowestKnocksCard(Map card, {required String scopeLevel, required Map<String, String> filter}) {
    final from = (card['from'] ?? '').toString();
    final to = (card['to'] ?? '').toString();
    final reps = (card['reps'] as List?) ?? const [];
    void openRow(String? focusId) => _openRankings(
          scopeLevel: scopeLevel,
          from: from,
          to: to,
          sort: 'verifiedKnocks',
          desc: false,
          filter: filter,
          focus: focusId,
        );

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // "See all" scrolls to the viewer's own row too, same default the
          // web board applies when a link doesn't name a specific rep.
          _cardHead('Lowest Knocks', 'Last 7 days, ${_fmtDay(from)} to ${_fmtDay(to)}', onSeeAll: () => openRow('me')),
          const SizedBox(height: 12),
          Divider(height: 1, color: AppColors.border.withOpacity(0.5)),
          const SizedBox(height: 11),
          ...reps.asMap().entries.map((e) {
            final i = e.key;
            final r = e.value as Map;
            final id = (r['id'] ?? '').toString();
            final name = (r['name'] ?? '').toString();
            final n = (r['knocks'] is num) ? (r['knocks'] as num).round() : 0;
            return Padding(
              padding: EdgeInsets.only(bottom: i == reps.length - 1 ? 0 : 9),
              child: GestureDetector(
                onTap: id.isEmpty ? null : () => openRow(id),
                behavior: HitTestBehavior.opaque,
                child: Row(
                  children: [
                    SizedBox(width: 16, child: Text('${i + 1}', style: TextStyle(fontSize: 11, color: AppColors.textPlaceholder))),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w700,
                            color: id.isEmpty ? AppColors.textDark : _primary,
                            decoration: id.isEmpty ? null : TextDecoration.underline,
                            decorationColor: AppColors.border,
                          )),
                    ),
                    const SizedBox(width: 8),
                    Text('$n ${n == 1 ? 'knock' : 'knocks'}',
                        style: TextStyle(fontSize: 12, color: AppColors.textLight, fontFeatures: const [FontFeature.tabularFigures()])),
                  ],
                ),
              ),
            );
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
