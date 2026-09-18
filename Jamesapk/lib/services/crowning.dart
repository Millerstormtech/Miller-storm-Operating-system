// Pure port of src/lib/scoreboard/crowning.ts — same rules, same copy, so the
// web and mobile ceremony can never quietly disagree about who gets crowned.

class Crowning {
  final String month; // "2026-08"
  final String repName;
  final num revenue;
  final bool isViewer;

  Crowning({required this.month, required this.repName, required this.revenue, required this.isViewer});

  static Crowning? fromJson(Map? json) {
    if (json == null) return null;
    final month = (json['month'] ?? '').toString();
    if (month.isEmpty) return null;
    return Crowning(
      month: month,
      repName: (json['repName'] ?? '').toString(),
      revenue: (json['revenue'] is num) ? json['revenue'] as num : num.tryParse('${json['revenue']}') ?? 0,
      isViewer: json['isViewer'] == true,
    );
  }
}

class MomentCopy {
  final String mark;
  final String title;
  final String line;
  const MomentCopy({required this.mark, required this.title, required this.line});
}

/// crowning.month !== "" and it hasn't been shown for THIS month yet. A never-
/// seen viewer (seenMonth null) always sees the newest crowning immediately.
bool shouldCelebrateCrowning(Crowning? crowning, String? seenMonth) {
  if (crowning == null || crowning.month.isEmpty) return false;
  return crowning.month != seenMonth;
}

const List<String> _monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

String crowningMonthLabel(String month) {
  final parts = month.split('-');
  if (parts.length < 2) return month;
  final index = (int.tryParse(parts[1]) ?? 0) - 1;
  if (index < 0 || index >= _monthNames.length) return month;
  return '${_monthNames[index]} ${parts[0]}';
}

MomentCopy crowningCopy(Crowning crowning) {
  final label = crowningMonthLabel(crowning.month);
  if (crowning.isViewer) {
    return MomentCopy(mark: '👑', title: 'You are Contract King', line: '$label. Nobody in the company signed more.');
  }
  return MomentCopy(mark: '👑', title: '${crowning.repName} is Contract King', line: '$label. Beat that this month.');
}

/// Only a positive, finite gain counts — a first visit (previous null), an
/// unchanged count, or a drop (voided deal) never celebrates.
int contractsGained(num? previous, num current) {
  if (previous == null || !previous.isFinite || !current.isFinite) return 0;
  final gained = current.floor() - previous.floor();
  return gained > 0 ? gained : 0;
}

MomentCopy contractCopy(int gained, num totalThisYear) {
  final title = gained == 1 ? 'Contract signed' : '$gained contracts signed';
  return MomentCopy(mark: '💰', title: title, line: 'That puts you on $totalThisYear this year.');
}
