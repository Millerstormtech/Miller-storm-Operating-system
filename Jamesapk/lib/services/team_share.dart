// Team history (2026-10-07): under a Team or Branch filter a rep who moved
// mid-period shows only the numbers earned in the selected teams/branches, with
// a short note. Mirrors shareForSelection in src/lib/leaderboard/filters.ts and
// moveNote in src/lib/teamhistory/segments.ts so phone and web agree. Older
// servers send no `segments`; then the whole row is used, as before.

const _metrics = ['verifiedKnocks', 'leadsCreated', 'filed', 'won', 'revenue'];
const _noValue = '__none__';

bool _matches(String value, Set<String> selected) {
  if (selected.isEmpty) return true;
  return selected.contains(value.isEmpty ? _noValue : value);
}

Map<String, dynamic>? shareForSelection(Map<String, dynamic> row, Set<String> branchSel, Set<String> teamSel) {
  if (branchSel.isEmpty && teamSel.isEmpty) return row;
  bool match(Map s) => _matches((s['branch'] ?? '').toString(), branchSel) && _matches((s['team'] ?? '').toString(), teamSel);

  final raw = row['segments'];
  final segs = (raw is List && raw.isNotEmpty)
      ? raw.map((s) => Map<String, dynamic>.from(s as Map)).toList()
      : [
          {
            'team': row['team'] ?? '', 'branch': row['branch'] ?? '', 'from': '', 'to': '',
            for (final k in _metrics) k: row[k] ?? 0,
          }
        ];

  final idx = <int>[];
  for (var i = 0; i < segs.length; i++) {
    if (match(segs[i])) idx.add(i);
  }
  final current = match({'team': row['team'] ?? '', 'branch': row['branch'] ?? ''});
  if (idx.isEmpty && !current) return null;

  final out = Map<String, dynamic>.from(row);
  num total = 0;
  for (final k in _metrics) {
    num v = 0;
    for (final i in idx) {
      final x = segs[i][k];
      v += (x is num) ? x : 0;
    }
    out[k] = v;
    total += v;
  }
  if (!current && total == 0) return null;

  String note = '';
  if (idx.isNotEmpty && idx.last + 1 < segs.length) {
    final next = segs[idx.last + 1];
    final team = (next['team'] ?? '').toString();
    final on = _shortDate((next['from'] ?? '').toString());
    note = team.isNotEmpty ? 'Moved to $team, $on' : 'Left the team, $on';
  } else if (idx.isNotEmpty && idx.first > 0) {
    note = 'Joined ${_shortDate((segs[idx.first]['from'] ?? '').toString())}';
  }
  out['_note'] = note;
  return out;
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "16 Sep", joined by a non-breaking space so a wrapped note never splits the date.
String _shortDate(String day) {
  final p = day.split('-');
  if (p.length != 3) return day;
  return '${int.parse(p[2])} ${_months[int.parse(p[1]) - 1]}';
}
