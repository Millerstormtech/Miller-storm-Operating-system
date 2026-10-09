// The DMO (Jay, 2026-10-02): each person's monthly goal and weekly commitment,
// tracked against their real numbers. Labels, formats and the income
// calculator for the phone's DMO screen. Mirrors src/lib/dmo/config.ts,
// rules.ts and DmoPage.tsx so phone and web say the same thing. Every colour
// and state comes from the server (/api/dmo): nothing here decides who is on
// pace.
import 'package:flutter/material.dart';

/// Jay's weekly minimum: 100 verified doors OR 1 claim filed (OR a $40K
/// monthly contract average over the last 90 days).
const kMinWeeklyDoors = 100;
const kMinWeeklyClaims = 1;
const kDefaultCommissionPerRoof = 5000;

/// The first monthly DMO is November's (launch, Youssef 2026-10-08).
const kFirstDmoMonth = '2026-11';

/// What a rep commits to each week, in the web's order.
const dmoWeeklyFields = ['doors', 'claims', 'contracts', 'contractDollars'];

const dmoFieldLabels = {
  'doors': 'Doors',
  'claims': 'Claims',
  'contracts': 'Contracts',
  'contractDollars': r'Contract $',
};

const _chipLabels = {
  'met': 'Minimum met',
  'at-contract': 'At contract',
  'on-pace': 'On pace',
  'at-risk': 'At risk',
  'off-pace': 'Off pace',
  'missed': 'Missed the minimum',
  'ramp': 'Ramp',
  'away': 'Away',
};

const _formLabels = {
  'not-open': 'Opens Thursday',
  'due': 'Not done yet',
  'overdue': 'Not done',
  'done': 'Done',
  'late': 'Done late',
};

/// The minimum chip's words: "On pace", "Ramp: day 12 of 90".
String dmoChipLabel(Map chip) {
  final state = (chip['state'] ?? '').toString();
  if (state == 'ramp') return 'Ramp: day ${chip['rampDay'] ?? 0} of 90';
  return _chipLabels[state] ?? state;
}

String dmoFormLabel(String state) => _formLabels[state] ?? state;

const _green = Color(0xFF16A34A);
const _yellow = Color(0xFFD97706);
const _red = Color(0xFFDC2626);

/// green / yellow / red from the server; null (ramp, away, nobody counted) is grey.
Color dmoColour(dynamic colour, Color grey) {
  switch (colour) {
    case 'green':
      return _green;
    case 'yellow':
      return _yellow;
    case 'red':
      return _red;
    default:
      return grey;
  }
}

const dmoRed = _red;

// ---- numbers ---------------------------------------------------------------

num dmoNum(dynamic v) => v is num ? v : num.tryParse('$v') ?? 0;

String _grouped(int n) {
  final s = n.abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
    buf.write(s[i]);
  }
  return '${n < 0 ? '-' : ''}$buf';
}

/// "28,400", like the web's fmtCount.
String dmoCount(dynamic n) => _grouped(dmoNum(n).round());

/// "$40,000", like the web's fmtMoney.
String dmoMoney(dynamic n) {
  final v = dmoNum(n).round();
  return '${v < 0 ? '-' : ''}\$${_grouped(v.abs())}';
}

String dmoField(String field, dynamic n) => field == 'contractDollars' ? dmoMoney(n) : dmoCount(n);

/// "1 claim", "3 claims".
String dmoPlural(dynamic n, String word) {
  final v = dmoNum(n).round();
  return '${_grouped(v)} $word${v == 1 ? '' : 's'}';
}

// ---- days and months ("YYYY-MM-DD" / "YYYY-MM", Central dates from the server)

const _monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

DateTime? _day(String day) {
  final p = day.split('-');
  if (p.length != 3) return null;
  final y = int.tryParse(p[0]), m = int.tryParse(p[1]), d = int.tryParse(p[2]);
  if (y == null || m == null || d == null) return null;
  return DateTime.utc(y, m, d);
}

String _ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String dmoAddDays(String day, int n) {
  final d = _day(day);
  return d == null ? day : _ymd(d.add(Duration(days: n)));
}

/// "Sat, Oct 10".
String dmoDayLabel(String day) {
  final d = _day(day);
  if (d == null) return day;
  return '${_weekdays[d.weekday - 1]}, ${_monthNames[d.month - 1].substring(0, 3)} ${d.day}';
}

/// "November 2026".
String dmoMonthLabel(String month) {
  final p = month.split('-');
  final m = p.length == 2 ? int.tryParse(p[1]) : null;
  if (m == null || m < 1 || m > 12) return month;
  return '${_monthNames[m - 1]} ${p[0]}';
}

/// "November".
String dmoMonthName(String month) {
  final m = int.tryParse(month.length >= 7 ? month.substring(5, 7) : '');
  return (m != null && m >= 1 && m <= 12) ? _monthNames[m - 1] : month;
}

int dmoDaysInMonth(String month) {
  final p = month.split('-');
  final y = int.tryParse(p[0]) ?? 2000, m = p.length > 1 ? int.tryParse(p[1]) ?? 1 : 1;
  return DateTime.utc(y, m + 1, 0).day;
}

// ---- Central time (the DMO's deadlines are Central) -------------------------

/// US Central Daylight Time runs from the second Sunday of March 08:00 UTC to
/// the first Sunday of November 07:00 UTC (same rule as the Storm Chat times).
bool _isCentralDst(DateTime utc) {
  final y = utc.year;
  final marchSunday = 1 + ((7 - DateTime.utc(y, 3, 1).weekday) % 7);
  final novSunday = 1 + ((7 - DateTime.utc(y, 11, 1).weekday) % 7);
  return !utc.isBefore(DateTime.utc(y, 3, marchSunday + 7, 8)) && utc.isBefore(DateTime.utc(y, 11, novSunday, 7));
}

DateTime _toCentral(DateTime t) {
  final utc = t.toUtc();
  return utc.subtract(Duration(hours: _isCentralDst(utc) ? 5 : 6));
}

/// "Fri 1:00 PM CT".
String dmoTimeLabel(String iso) {
  final t = DateTime.tryParse(iso);
  if (t == null) return '';
  final c = _toCentral(t);
  final h = c.hour % 12 == 0 ? 12 : c.hour % 12;
  return '${_weekdays[c.weekday - 1]} $h:${c.minute.toString().padLeft(2, '0')} ${c.hour < 12 ? 'AM' : 'PM'} CT';
}

// ---- the income calculator (Rep DMO PDF, "Own your number") -----------------

class DmoIncomePlan {
  final int roofsNeeded;
  final int claimsNeeded;

  /// Claims a week to stay on track, one decimal.
  final double weeklyClaims;
  const DmoIncomePlan(this.roofsNeeded, this.claimsNeeded, this.weeklyClaims);

  /// "1.5", or "2" when whole, like the web prints a number.
  String get weeklyClaimsLabel =>
      weeklyClaims == weeklyClaims.roundToDouble() ? weeklyClaims.round().toString() : weeklyClaims.toString();
}

/// $10,000 goal / $5,000 per roof = 2 roofs; half of claims become roofs, so 4 claims.
DmoIncomePlan? dmoIncomePlan(num incomeGoal, num commissionPerRoof, int monthDays) {
  if (!(incomeGoal > 0) || !(commissionPerRoof > 0) || monthDays <= 0) return null;
  final roofs = (incomeGoal / commissionPerRoof).ceil();
  final claims = (roofs / 0.5).ceil();
  final weekly = ((claims / (monthDays / 7)) * 10).round() / 10;
  return DmoIncomePlan(roofs, claims, weekly);
}
