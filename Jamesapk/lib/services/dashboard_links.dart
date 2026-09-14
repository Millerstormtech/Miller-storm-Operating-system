// Where each part of the role dashboard links to, and with which filters
// already applied on arrival — the Dart mirror of src/lib/scoreboard/links.ts
// on the web. Pure (no widgets, no navigation): dashboard_view.dart builds
// these and the rankings/course-leaderboard screens read them back in
// initState, once, exactly like the web board reads its own query string.
//
// The rules were agreed with Youssef on 2026-09-13, one role at a time:
//   - every card has a "See all" link; branch and team cards also link each #1
//   - a link opens on the SAME period the tapped number shows (year to date ->
//     this year, month to date -> this month)
//   - the rank line opens the full board, no filters, this month
//   - the board scrolls to the viewer's own row (focus = 'me') or a named rep
import 'package:flutter/foundation.dart';

/// Every column the rankings screens can sort by (their own sort keys).
const List<String> kSalesSorts = [
  'name', 'branch', 'team', 'verifiedKnocks', 'leadsCreated', 'filed', 'won', 'revenue',
];

/// The dashboard's metric names -> the rankings screen's column names.
const Map<String, String> kMetricSort = {
  'revenue': 'revenue',
  'contracts': 'won',
  'claims': 'filed',
  'knocks': 'verifiedKnocks',
};

/// Each role's own rankings route, so a link never lands someone in another
/// panel's drawer/layout.
const Map<String, String> _rankingsRoutes = {
  'company': '/clevel-rankings',
  'branch': '/bm-rankings',
  'team': '/manager-rankings',
  'self': '/rankings',
};

/// A rep's training card is a to-do list, so it opens the Training Center
/// rather than the Course Leaderboard (Youssef, 2026-09-13).
const Map<String, String> _trainingRoutes = {
  'company': '/clevel-training-leaderboard',
  'branch': '/bm-training-leaderboard',
  'team': '/manager-training-leaderboard',
  'self': '/courses',
};

String rankingsRoute(String scopeLevel) => _rankingsRoutes[scopeLevel] ?? '/rankings';

String trainingRoute(String scopeLevel) => _trainingRoutes[scopeLevel] ?? '/courses';

String metricSort(String metric) => kMetricSort[metric] ?? 'revenue';

/// "2026-06" -> {from: "2026-06-01", to: "2026-06-30"}.
Map<String, String> monthRangeFor(String monthKey) {
  final parts = monthKey.split('-');
  final y = int.tryParse(parts[0]) ?? DateTime.now().year;
  final m = parts.length > 1 ? (int.tryParse(parts[1]) ?? 1) : 1;
  final lastDay = DateTime.utc(y, m + 1, 0).day;
  final mm = m.toString().padLeft(2, '0');
  return {
    'from': '$y-$mm-01',
    'to': '$y-$mm-${lastDay.toString().padLeft(2, '0')}',
  };
}

/// What narrows the board to the viewer's own scope. A company or a rep gets
/// none: Jay's view is the company, and a rep compares against everyone.
Map<String, String> scopeFilterFor({required String level, String? branch, String? team}) {
  if (level == 'branch' && (branch ?? '').isNotEmpty) return {'branch': branch!};
  if (level == 'team' && (team ?? '').isNotEmpty) return {'team': team!};
  return const {};
}

/// Arguments a rankings screen (any role) accepts on arrival, via
/// `Navigator.pushNamed(route, arguments: RankingsLinkArgs(...))`. All fields
/// optional and applied exactly once — a plain drawer navigation passes none
/// of this, so every screen's default behavior is unchanged.
@immutable
class RankingsLinkArgs {
  /// 'month' or 'year' — mutually exclusive with [from]/[to].
  final String? window;
  final String? from;
  final String? to;
  final String sort;
  final bool desc;
  final String? branch;
  final String? team;
  /// 'me' scrolls to the viewer's own row; anything else is a leaderboard row id.
  final String? focus;

  const RankingsLinkArgs({
    this.window,
    this.from,
    this.to,
    this.sort = 'revenue',
    this.desc = true,
    this.branch,
    this.team,
    this.focus,
  });
}

/// Arguments a course-leaderboard screen accepts on arrival.
@immutable
class TrainingLinkArgs {
  final String? branch;
  final String? team;

  const TrainingLinkArgs({this.branch, this.team});
}
