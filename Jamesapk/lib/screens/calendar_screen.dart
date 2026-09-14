import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:convert';
import '../services/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/role_bottom_nav.dart';

/// My Calendar — a grid of this person's Google Calendar events, mirroring
/// the web app's week grid: This Week / Today / Tomorrow / Custom Range all
/// render the SAME grid (day columns x hourly rows), never a plain list.
/// Same shared-screen shape as AnnouncementsScreen/TicketScreen: one screen
/// for every role, reached from each role's drawer. Read-only — connecting
/// and disconnecting are the only writes this screen makes.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

enum _FilterMode { week, today, tomorrow, range }

class _DayRange {
  final DateTime from;
  final DateTime to;
  const _DayRange(this.from, this.to);
}

class _LaidOutEvent {
  final Map<String, dynamic> event;
  final DateTime start;
  final DateTime end;
  int col = 0;
  int cols = 1;
  _LaidOutEvent(this.event, this.start, this.end);
}

const double _hourHeight = 46;
const double _minEventHeight = 22;
const double _gutterWidth = 44;
const double _dayColMinWidth = 132;
const _weekdayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

DateTime _startOfDay(DateTime d) => DateTime(d.year, d.month, d.day);
DateTime _startOfWeek(DateTime d) => _startOfDay(d).subtract(Duration(days: d.weekday % 7));
DateTime _addDays(DateTime d, int n) => DateTime(d.year, d.month, d.day + n);
bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;
String _hourLabel(int h) {
  if (h == 0) return '12 AM';
  if (h == 12) return '12 PM';
  return h < 12 ? '$h AM' : '${h - 12} PM';
}
// Same greedy overlap-column layout as web's layoutOverlaps() in MyCalendar.tsx.
List<_LaidOutEvent> _layoutOverlaps(List<_LaidOutEvent> events) {
  final sorted = [...events]..sort((a, b) {
    final byStart = a.start.compareTo(b.start);
    return byStart != 0 ? byStart : a.end.compareTo(b.end);
  });
  final out = <_LaidOutEvent>[];
  var cluster = <_LaidOutEvent>[];
  var columnEnds = <DateTime>[];
  DateTime? clusterMaxEnd;

  void flush() {
    if (cluster.isEmpty) return;
    final cols = columnEnds.length;
    for (final e in cluster) {
      e.cols = cols;
    }
    out.addAll(cluster);
    cluster = [];
    columnEnds = [];
    clusterMaxEnd = null;
  }

  for (final ev in sorted) {
    if (cluster.isNotEmpty && clusterMaxEnd != null && !ev.start.isBefore(clusterMaxEnd!)) flush();
    var col = columnEnds.indexWhere((end) => !end.isAfter(ev.start));
    if (col == -1) {
      col = columnEnds.length;
      columnEnds.add(ev.end);
    } else {
      columnEnds[col] = ev.end;
    }
    ev.col = col;
    cluster.add(ev);
    clusterMaxEnd = clusterMaxEnd == null || ev.end.isAfter(clusterMaxEnd!) ? ev.end : clusterMaxEnd;
  }
  flush();
  return out;
}

class _CalendarScreenState extends State<CalendarScreen> {
  static const Color _primary = Color(0xFFCB0002);
  Color get _bg => AppColors.bg;
  Color get _surface => AppColors.surface;
  Color get _textDark => AppColors.textDark;
  Color get _textLight => AppColors.textLight;
  Color get _border => AppColors.border;

  bool _loading = true;
  bool _loadFailed = false;
  bool? _connected;
  List<Map<String, dynamic>> _events = [];
  bool _connecting = false;
  bool _disconnecting = false;

  _FilterMode _mode = _FilterMode.week;
  DateTime _weekStart = _startOfWeek(DateTime.now());
  DateTime _rangeFrom = _startOfDay(DateTime.now());
  DateTime _rangeTo = _addDays(_startOfDay(DateTime.now()), 6);
  _DayRange _appliedRange = _DayRange(_startOfDay(DateTime.now()), _addDays(_startOfDay(DateTime.now()), 6));

  final _gridScrollController = ScrollController();
  bool _hasScrolledToBusinessHours = false;
  DateTime Function() _min = () => DateTime.now();
  DateTime Function() _max = () => DateTime.now();

  @override
  void initState() {
    super.initState();
    _loadForMode();
  }

  @override
  void dispose() {
    _gridScrollController.dispose();
    super.dispose();
  }

  List<DateTime> get _days {
    final today = _startOfDay(DateTime.now());
    if (_mode == _FilterMode.today) return [today];
    if (_mode == _FilterMode.tomorrow) return [_addDays(today, 1)];
    if (_mode == _FilterMode.range) {
      final n = _appliedRange.to.difference(_appliedRange.from).inDays + 1;
      return List.generate(n < 1 ? 1 : n, (i) => _addDays(_appliedRange.from, i));
    }
    return List.generate(7, (i) => _addDays(_weekStart, i));
  }

  Future<void> _load(DateTime min, DateTime max) async {
    _min = () => min;
    _max = () => max;
    setState(() => _loadFailed = false);
    // Clear the previous fetch's events right away — otherwise switching
    // filters briefly re-buckets the OLD events into the NEW filter's day
    // columns before the new fetch resolves, same fix as the web version.
    setState(() => _events = []);
    try {
      final uri = Uri.parse('https://millerstorm.tech/api/calendar/events').replace(queryParameters: {
        'timeMin': min.toUtc().toIso8601String(),
        'timeMax': max.toUtc().toIso8601String(),
      });
      final res = await api.get(uri);
      if (res.statusCode == 200 && mounted) {
        final data = json.decode(res.body) as Map<String, dynamic>;
        setState(() {
          _connected = data['connected'] == true;
          _events = (data['events'] as List?)?.whereType<Map<String, dynamic>>().toList() ?? [];
          _loading = false;
        });
        _scrollToBusinessHoursOnce();
        return;
      }
      if (mounted) setState(() => _loadFailed = true);
    } catch (_) {
      if (mounted) setState(() => _loadFailed = true);
    }
    if (mounted) setState(() => _loading = false);
  }

  // Land on business hours instead of midnight, once, the first time the
  // grid actually renders — same as the web version.
  void _scrollToBusinessHoursOnce() {
    if (_hasScrolledToBusinessHours || _connected != true) return;
    _hasScrolledToBusinessHours = true;
    final now = DateTime.now();
    final showsToday = _days.any((d) => _sameDay(d, now));
    final anchorHour = showsToday ? (now.hour - 1).clamp(0, 23) : 7;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_gridScrollController.hasClients) {
        _gridScrollController.jumpTo(anchorHour * _hourHeight);
      }
    });
  }

  void _loadForMode() {
    final today = _startOfDay(DateTime.now());
    if (_mode == _FilterMode.today) {
      _load(today, _addDays(today, 1));
    } else if (_mode == _FilterMode.tomorrow) {
      final s = _addDays(today, 1);
      _load(s, _addDays(s, 1));
    } else if (_mode == _FilterMode.week) {
      _load(_weekStart, _addDays(_weekStart, 7));
    }
    // range mode is loaded explicitly by _applyRange(), not here.
  }

  void _setMode(_FilterMode mode) {
    setState(() => _mode = mode);
    if (mode != _FilterMode.range) _loadForMode();
  }

  Future<void> _pickDate({required bool isFrom}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: isFrom ? _rangeFrom : _rangeTo,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
    );
    if (picked == null) return;
    setState(() {
      if (isFrom) {
        _rangeFrom = _startOfDay(picked);
      } else {
        _rangeTo = _startOfDay(picked);
      }
    });
  }

  void _applyRange() {
    final from = _rangeFrom.isBefore(_rangeTo) || _sameDay(_rangeFrom, _rangeTo) ? _rangeFrom : _rangeTo;
    final to = _rangeFrom.isBefore(_rangeTo) || _sameDay(_rangeFrom, _rangeTo) ? _rangeTo : _rangeFrom;
    setState(() {
      _appliedRange = _DayRange(from, to);
      _mode = _FilterMode.range;
    });
    _load(from, _addDays(to, 1));
  }

  Future<void> _connect() async {
    setState(() => _connecting = true);
    try {
      final res = await api.post(Uri.parse('https://millerstorm.tech/api/calendar/mobile-connect-link'));
      if (res.statusCode == 200) {
        final data = json.decode(res.body) as Map<String, dynamic>;
        final url = (data['url'] ?? '').toString();
        final uri = Uri.tryParse(url);
        if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: const Text('❌ Could not start Google Calendar connect.'),
          backgroundColor: Colors.red[700],
        ));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: const Text('❌ Could not start Google Calendar connect.'),
          backgroundColor: Colors.red[700],
        ));
      }
    } finally {
      if (mounted) setState(() => _connecting = false);
    }
  }

  Future<void> _disconnect() async {
    setState(() => _disconnecting = true);
    try {
      await api.post(Uri.parse('https://millerstorm.tech/api/calendar/disconnect'));
      if (mounted) setState(() { _connected = false; _events = []; });
    } finally {
      if (mounted) setState(() => _disconnecting = false);
    }
  }

  // Bucket events per visible day column, same rules as web: all-day on its
  // start day only, timed events crossing midnight clipped to their start day.
  ({List<List<Map<String, dynamic>>> allDay, List<List<_LaidOutEvent>> timed}) _bucket(List<DateTime> days) {
    final allDay = List.generate(days.length, (_) => <Map<String, dynamic>>[]);
    final timedRaw = List.generate(days.length, (_) => <_LaidOutEvent>[]);
    for (final ev in _events) {
      final isAllDay = ev['allDay'] == true;
      final startStr = (ev['start'] ?? '').toString();
      if (isAllDay) {
        final d = DateTime.tryParse(startStr);
        if (d == null) continue;
        final idx = days.indexWhere((day) => _sameDay(day, d));
        if (idx != -1) allDay[idx].add(ev);
        continue;
      }
      final start = DateTime.tryParse(startStr)?.toLocal();
      if (start == null) continue;
      final idx = days.indexWhere((day) => _sameDay(day, start));
      if (idx == -1) continue;
      final rawEnd = DateTime.tryParse((ev['end'] ?? '').toString())?.toLocal() ?? start;
      final midnight = _addDays(days[idx], 1);
      final end = rawEnd.isAfter(midnight) ? midnight : rawEnd;
      timedRaw[idx].add(_LaidOutEvent(ev, start, end));
    }
    final timed = timedRaw.map(_layoutOverlaps).toList();
    return (allDay: allDay, timed: timed);
  }

  String _rangeLabel(List<DateTime> days) {
    final first = days.first;
    final last = days.last;
    if (_mode == _FilterMode.today) return 'Today, ${_months[first.month - 1]} ${first.day}';
    if (_mode == _FilterMode.tomorrow) return 'Tomorrow, ${_months[first.month - 1]} ${first.day}';
    if (_sameDay(first, last)) return '${_months[first.month - 1]} ${first.day}, ${first.year}';
    if (first.month == last.month) return '${_months[first.month - 1]} ${first.year}';
    return '${_months[first.month - 1]} – ${_months[last.month - 1]} ${last.year}';
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: themeController,
      builder: (context, _) => Scaffold(
        backgroundColor: _bg,
        drawer: const RoleBottomNav(),
        appBar: AppBar(
          backgroundColor: _primary,
          elevation: 0,
          iconTheme: const IconThemeData(color: Colors.white),
          title: const Text('My Calendar', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        ),
        // A Column (not a ListView) so the grid can Expand to fill the rest of
        // the screen instead of stopping at a fixed height and leaving blank
        // space below it — pull-to-refresh lives on the grid's own vertical
        // scroll (see _calendarGrid()), since that's the only state with
        // anything worth dragging to refresh.
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _primary))
                : _loadFailed
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.error_outline, size: 56, color: _textLight.withOpacity(0.4)),
                            const SizedBox(height: 12),
                            Text('Your calendar could not be loaded.',
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _textDark)),
                            const SizedBox(height: 12),
                            TextButton(onPressed: () => _load(_min(), _max()), child: const Text('Try again')),
                          ],
                        ),
                      )
                    : _connected != true
                        ? _connectCard()
                        : _calendarGrid(),
          ),
        ),
      ),
    );
  }

  Widget _connectCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: _surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: _border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Connect your calendar', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: _textDark)),
          const SizedBox(height: 6),
          Text('Connect your Google Calendar to see your upcoming events here.', style: TextStyle(fontSize: 13.5, color: _textLight)),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _connecting ? null : _connect,
              style: ElevatedButton.styleFrom(
                backgroundColor: _primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: Text(_connecting ? 'Opening…' : 'Connect Google Calendar', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _filterChip(String label, _FilterMode mode) {
    final active = _mode == mode;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: () => _setMode(mode),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: active ? _primary : AppColors.surfaceAlt,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: active ? _primary : _border),
          ),
          child: Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: active ? Colors.white : _textDark)),
        ),
      ),
    );
  }

  Widget _dateField(DateTime value, {required bool isFrom}) {
    return GestureDetector(
      onTap: () => _pickDate(isFrom: isFrom),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(color: AppColors.surfaceAlt, borderRadius: BorderRadius.circular(8), border: Border.all(color: _border)),
        child: Text('${_months[value.month - 1]} ${value.day}, ${value.year}', style: TextStyle(fontSize: 12.5, color: _textDark, fontWeight: FontWeight.w600)),
      ),
    );
  }

  Widget _calendarGrid() {
    final days = _days;
    final bucketed = _bucket(days);
    final hasAllDay = bucketed.allDay.any((l) => l.isNotEmpty);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  _filterChip('This Week', _FilterMode.week),
                  _filterChip('Today', _FilterMode.today),
                  _filterChip('Tomorrow', _FilterMode.tomorrow),
                  _filterChip('Custom Range', _FilterMode.range),
                ]),
              ),
            ),
            TextButton(
              onPressed: _disconnecting ? null : _disconnect,
              child: Text(_disconnecting ? 'Disconnecting…' : 'Disconnect', style: const TextStyle(color: _primary)),
            ),
          ],
        ),
        if (_mode == _FilterMode.range) ...[
          const SizedBox(height: 8),
          Row(children: [
            _dateField(_rangeFrom, isFrom: true),
            const Padding(padding: EdgeInsets.symmetric(horizontal: 6), child: Text('to')),
            _dateField(_rangeTo, isFrom: false),
            const SizedBox(width: 8),
            ElevatedButton(
              onPressed: _applyRange,
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.surfaceAlt, foregroundColor: _textDark, elevation: 0, padding: const EdgeInsets.symmetric(horizontal: 14)),
              child: const Text('Apply', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
            ),
          ]),
        ],
        const SizedBox(height: 10),
        Row(children: [
          if (_mode == _FilterMode.week) ...[
            _navBtn('Today', () { setState(() => _weekStart = _startOfWeek(DateTime.now())); _loadForMode(); }),
            const SizedBox(width: 6),
            _navIconBtn(Icons.chevron_left, () { setState(() => _weekStart = _addDays(_weekStart, -7)); _loadForMode(); }),
            _navIconBtn(Icons.chevron_right, () { setState(() => _weekStart = _addDays(_weekStart, 7)); _loadForMode(); }),
            const SizedBox(width: 6),
          ],
          Text(_rangeLabel(days), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: _textDark)),
        ]),
        const SizedBox(height: 10),
        // Expanded: the grid fills whatever vertical space is left on the
        // screen instead of stopping at a fixed height and leaving blank
        // space below it.
        Expanded(
          child: Container(
            decoration: BoxDecoration(border: Border.all(color: _border), borderRadius: BorderRadius.circular(12)),
            clipBehavior: Clip.antiAlias,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final available = constraints.maxWidth - _gutterWidth;
                final dayColWidth = days.length <= 1
                    ? (available < _dayColMinWidth ? _dayColMinWidth : available)
                    : (available / days.length < _dayColMinWidth ? _dayColMinWidth : available / days.length);
                final totalWidth = _gutterWidth + dayColWidth * days.length;

                return SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: SizedBox(
                    width: totalWidth,
                    child: Column(
                      children: [
                        _dayHeaderRow(days, dayColWidth),
                        if (hasAllDay) _allDayRow(days, bucketed.allDay, dayColWidth),
                        Expanded(
                          child: RefreshIndicator(
                            color: _primary,
                            onRefresh: () async {
                              if (_mode == _FilterMode.range) {
                                _load(_appliedRange.from, _addDays(_appliedRange.to, 1));
                              } else {
                                _loadForMode();
                              }
                            },
                            child: SingleChildScrollView(
                              controller: _gridScrollController,
                              child: _hourGrid(days, bucketed.timed, dayColWidth),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _navBtn(String label, VoidCallback? onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(color: AppColors.surfaceAlt, borderRadius: BorderRadius.circular(8), border: Border.all(color: _border)),
        child: Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: _textDark)),
      ),
    );
  }

  Widget _navIconBtn(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(left: 4),
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(color: AppColors.surfaceAlt, borderRadius: BorderRadius.circular(8), border: Border.all(color: _border)),
        child: Icon(icon, size: 16, color: _textDark),
      ),
    );
  }

  Widget _dayHeaderRow(List<DateTime> days, double dayColWidth) {
    final today = _startOfDay(DateTime.now());
    return Container(
      decoration: BoxDecoration(color: _surface, border: Border(bottom: BorderSide(color: _border))),
      child: Row(children: [
        SizedBox(width: _gutterWidth),
        ...days.map((d) {
          final isToday = _sameDay(d, today);
          return SizedBox(
            width: dayColWidth,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(children: [
                Text(_weekdayShort[d.weekday % 7], style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: _textLight, letterSpacing: 0.4)),
                const SizedBox(height: 4),
                Container(
                  width: 26,
                  height: 26,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: isToday ? _primary : null, shape: BoxShape.circle),
                  child: Text('${d.day}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: isToday ? Colors.white : _textDark)),
                ),
              ]),
            ),
          );
        }),
      ]),
    );
  }

  Widget _allDayRow(List<DateTime> days, List<List<Map<String, dynamic>>> allDay, double dayColWidth) {
    return Container(
      decoration: BoxDecoration(color: _surface, border: Border(bottom: BorderSide(color: _border))),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: _gutterWidth),
        ...List.generate(days.length, (i) {
          return SizedBox(
            width: dayColWidth,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: allDay[i].map((ev) {
                  final link = (ev['htmlLink'] ?? '').toString();
                  return GestureDetector(
                    onTap: () { final uri = Uri.tryParse(link); if (uri != null) launchUrl(uri, mode: LaunchMode.externalApplication); },
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 3),
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                      decoration: BoxDecoration(color: _primary, borderRadius: BorderRadius.circular(5)),
                      child: Text((ev['title'] ?? '').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w700)),
                    ),
                  );
                }).toList(),
              ),
            ),
          );
        }),
      ]),
    );
  }

  Widget _hourGrid(List<DateTime> days, List<List<_LaidOutEvent>> timed, double dayColWidth) {
    return SizedBox(
      height: _hourHeight * 24,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: _gutterWidth,
            child: Column(
              children: List.generate(24, (h) => SizedBox(
                height: _hourHeight,
                child: Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: Align(alignment: Alignment.topRight, child: Text(_hourLabel(h), style: TextStyle(fontSize: 9.5, color: _textLight))),
                ),
              )),
            ),
          ),
          ...List.generate(days.length, (i) {
            return SizedBox(
              width: dayColWidth,
              height: _hourHeight * 24,
              child: Stack(
                children: [
                  Column(children: List.generate(24, (h) => Container(
                    height: _hourHeight,
                    decoration: BoxDecoration(
                      border: Border(top: BorderSide(color: _border, width: 0.6), left: BorderSide(color: _border, width: 0.6)),
                    ),
                  ))),
                  ...timed[i].map((e) {
                    final top = (e.start.hour * 60 + e.start.minute) / 60 * _hourHeight;
                    final rawHeight = e.end.difference(e.start).inMinutes / 60 * _hourHeight;
                    final height = rawHeight < _minEventHeight ? _minEventHeight : rawHeight;
                    final width = dayColWidth / e.cols;
                    final link = (e.event['htmlLink'] ?? '').toString();
                    return Positioned(
                      top: top,
                      left: e.col * width,
                      width: (width - 2).clamp(1, dayColWidth),
                      height: height,
                      child: GestureDetector(
                        onTap: () { final uri = Uri.tryParse(link); if (uri != null) launchUrl(uri, mode: LaunchMode.externalApplication); },
                        child: Container(
                          margin: const EdgeInsets.only(right: 2),
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                          decoration: BoxDecoration(color: _primary, borderRadius: BorderRadius.circular(4), border: Border.all(color: _surface, width: 1)),
                          child: Text((e.event['title'] ?? '').toString(), maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                        ),
                      ),
                    );
                  }),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
