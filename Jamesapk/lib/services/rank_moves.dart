// Pure port of src/lib/scoreboard/rankMoves.ts's client-facing half. The
// server already computes rankDelta per row and the rankMoves{week,month}
// block (see pages/api/leaderboard.ts) — this file only mirrors the "should
// this climb be celebrated, and what does it say" rules, so the once-a-week
// gate can never drift between web and mobile.

class RankMoves {
  final String week; // Monday-of-week key, "YYYY-MM-DD"
  final String month; // "YYYY-MM" — the month the standing is run in
  final String basis;

  RankMoves({required this.week, required this.month, required this.basis});

  static RankMoves? fromJson(Map? json) {
    if (json == null) return null;
    final week = (json['week'] ?? '').toString();
    final month = (json['month'] ?? '').toString();
    if (week.isEmpty) return null;
    return RankMoves(week: week, month: month, basis: (json['basis'] ?? '').toString());
  }
}

class MomentCopy {
  final String mark;
  final String title;
  final String line;
  const MomentCopy({required this.mark, required this.title, required this.line});
}

/// Climbs only (delta > 0); standing still, slipping, or no prior rank never
/// celebrates. Fires once per week — a NEW week (even the same-size delta)
/// fires again, but the same week never repeats.
bool shouldCelebrateRankMove(int? delta, String? seenWeek, String week) {
  if (delta == null || delta <= 0) return false;
  if (week.isEmpty) return false;
  return seenWeek != week;
}

MomentCopy rankMoveCopy(int delta, int rank) {
  final places = delta == 1 ? 'a place' : '$delta places';
  return MomentCopy(
    mark: '📈',
    title: 'You moved up $places',
    line: 'You are now number $rank in the company this month.',
  );
}
