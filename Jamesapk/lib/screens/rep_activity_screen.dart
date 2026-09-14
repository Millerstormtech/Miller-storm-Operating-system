import 'package:flutter/material.dart';
import 'dart:convert';
import '../services/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/role_bottom_nav.dart';

/// Rep Activity — leadership view of daily rep app usage: how long each rep
/// spent on the app (web vs mobile), how much of that was training video or
/// quiz time, and which lessons they watched. Reads GET /api/activity/report,
/// same endpoint and data shape as the web ActivityReport component — c-level
/// and branch-manager only (the API itself enforces that; a role without
/// access gets a 403 and this screen just shows the "couldn't load" state).
/// Workforce usage data, never shown to the rep it's about.
class RepActivityScreen extends StatefulWidget {
  const RepActivityScreen({super.key});

  @override
  State<RepActivityScreen> createState() => _RepActivityScreenState();
}

const _roleLabel = {
  'admin': 'Admin', 'c-level': 'C-Level', 'branch-manager': 'Branch Manager',
  'sales-team-lead': 'Team Lead', 'sales': 'Sales', 'marketing': 'Marketing',
};
const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String _fmtSeconds(num? secondsRaw) {
  final s = (secondsRaw ?? 0).round().clamp(0, 1 << 30);
  if (s < 60) return '${s}s';
  final m = (s / 60).round();
  if (m < 60) return '${m}m';
  final h = m ~/ 60;
  final rem = m % 60;
  return rem > 0 ? '${h}h ${rem}m' : '${h}h';
}

String _todayUtcStr() {
  final d = DateTime.now().toUtc();
  return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

num _n(dynamic v) => v is num ? v : 0;

class _RepActivityScreenState extends State<RepActivityScreen> {
  static const Color _primary = Color(0xFFCB0002);
  Color get _bg => AppColors.bg;
  Color get _surface => AppColors.surface;
  Color get _textDark => AppColors.textDark;
  Color get _textLight => AppColors.textLight;
  Color get _border => AppColors.border;

  String _date = _todayUtcStr();
  List<Map<String, dynamic>> _reps = [];
  bool _loading = true;
  bool _failed = false;
  final Set<String> _expanded = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _failed = false; });
    try {
      final uri = Uri.parse('https://millerstorm.tech/api/activity/report').replace(queryParameters: {'date': _date});
      final res = await api.get(uri);
      if (res.statusCode == 200 && mounted) {
        final data = json.decode(res.body) as Map<String, dynamic>;
        setState(() {
          _reps = (data['reps'] as List?)?.whereType<Map<String, dynamic>>().toList() ?? [];
          _loading = false;
        });
        return;
      }
      if (mounted) setState(() => _failed = true);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_date) ?? now,
      firstDate: DateTime(2024),
      lastDate: now,
    );
    if (picked == null) return;
    setState(() => _date = '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}');
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final totalApp = _reps.fold<num>(0, (n, r) => n + _n(r['appSecondsWeb']) + _n(r['appSecondsMobile']));
    final totalVideo = _reps.fold<num>(0, (n, r) => n + _n(r['videoSecondsWeb']) + _n(r['videoSecondsMobile']));

    return AnimatedBuilder(
      animation: themeController,
      builder: (context, _) => Scaffold(
        backgroundColor: _bg,
        drawer: const RoleBottomNav(),
        appBar: AppBar(
          backgroundColor: _primary,
          elevation: 0,
          iconTheme: const IconThemeData(color: Colors.white),
          title: const Text('Rep Activity', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        ),
        body: RefreshIndicator(
          color: _primary,
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(children: [
                GestureDetector(
                  onTap: _pickDate,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                    decoration: BoxDecoration(color: AppColors.surfaceAlt, borderRadius: BorderRadius.circular(8), border: Border.all(color: _border)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.calendar_today_outlined, size: 14, color: _textDark),
                      const SizedBox(width: 8),
                      Text(_dateLabel(_date), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _textDark)),
                    ]),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: _load,
                  child: Container(
                    padding: const EdgeInsets.all(9),
                    decoration: BoxDecoration(color: AppColors.surfaceAlt, borderRadius: BorderRadius.circular(8), border: Border.all(color: _border)),
                    child: Icon(Icons.refresh, size: 16, color: _textDark),
                  ),
                ),
              ]),
              if (!_loading && !_failed) ...[
                const SizedBox(height: 10),
                Wrap(spacing: 14, runSpacing: 4, children: [
                  _statLabel('${_reps.length} active reps'),
                  _statLabel('App: ${_fmtSeconds(totalApp)}'),
                  _statLabel('Video: ${_fmtSeconds(totalVideo)}'),
                ]),
              ],
              const SizedBox(height: 14),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.all(40),
                  child: Center(child: CircularProgressIndicator(color: _primary)),
                )
              else if (_failed)
                Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(children: [
                    Icon(Icons.error_outline, size: 56, color: _textLight.withOpacity(0.4)),
                    const SizedBox(height: 12),
                    Text("Couldn't load activity.", style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _textDark)),
                    const SizedBox(height: 12),
                    TextButton(onPressed: _load, child: const Text('Try again')),
                  ]),
                )
              else if (_reps.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(children: [
                    Icon(Icons.bar_chart_outlined, size: 56, color: _textLight.withOpacity(0.4)),
                    const SizedBox(height: 12),
                    Text('No app activity recorded on this day yet.', textAlign: TextAlign.center, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _textDark)),
                  ]),
                )
              else
                ..._reps.map(_repCard),
              const SizedBox(height: 8),
              Text(
                'Times are how long the app/site was open and focused (UTC day). Video and Quiz are the portion of that spent on a training video or quiz.',
                style: TextStyle(fontSize: 11.5, color: _textLight, height: 1.4),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _dateLabel(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return '${_months[d.month - 1]} ${d.day}, ${d.year}';
  }

  Widget _statLabel(String text) => Text(text, style: TextStyle(fontSize: 12.5, color: _textLight));

  Widget _repCard(Map<String, dynamic> rep) {
    final userId = (rep['userId'] ?? '').toString();
    final name = (rep['name'] ?? '').toString();
    final role = (rep['role'] ?? '').toString();
    final appWeb = _n(rep['appSecondsWeb']);
    final appMobile = _n(rep['appSecondsMobile']);
    final video = _n(rep['videoSecondsWeb']) + _n(rep['videoSecondsMobile']);
    final quiz = _n(rep['quizSecondsWeb']) + _n(rep['quizSecondsMobile']);
    final videos = (rep['videos'] as List?)?.whereType<Map<String, dynamic>>().toList() ?? [];
    final quizzes = (rep['quizzes'] as List?)?.whereType<Map<String, dynamic>>().toList() ?? [];
    final detailCount = videos.length + quizzes.length;
    final isOpen = _expanded.contains(userId);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(color: _surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: _border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(14),
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
                          Text(name, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: _textDark)),
                          const SizedBox(height: 2),
                          Text(_roleLabel[role] ?? role, style: TextStyle(fontSize: 12, color: _textLight)),
                        ],
                      ),
                    ),
                    if (detailCount > 0)
                      GestureDetector(
                        onTap: () => setState(() => isOpen ? _expanded.remove(userId) : _expanded.add(userId)),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: isOpen ? _primary : AppColors.surfaceAlt,
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: isOpen ? _primary : _border),
                          ),
                          child: Text('$detailCount ${isOpen ? '▾' : '▸'}',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: isOpen ? Colors.white : _textDark)),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(spacing: 14, runSpacing: 6, children: [
                  _metric('Web', _fmtSeconds(appWeb)),
                  _metric('Mobile', _fmtSeconds(appMobile)),
                  _metric('Total', _fmtSeconds(appWeb + appMobile), bold: true),
                  _metric('Video', _fmtSeconds(video)),
                  _metric('Quiz', _fmtSeconds(quiz)),
                ]),
              ],
            ),
          ),
          if (isOpen && detailCount > 0)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: _courseGroups(videos, quizzes),
            ),
        ],
      ),
    );
  }

  Widget _metric(String label, String value, {bool bold = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, color: _textLight, letterSpacing: 0.3)),
        Text(value, style: TextStyle(fontSize: 13, fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: _textDark)),
      ],
    );
  }

  Widget _courseGroups(List<Map<String, dynamic>> videos, List<Map<String, dynamic>> quizzes) {
    final courses = <String, Map<String, dynamic>>{};
    void bucket(Map<String, dynamic> item, String kind) {
      final key = (item['courseId'] ?? '').toString().isEmpty ? '__none__' : item['courseId'].toString();
      final g = courses.putIfAbsent(key, () => {
        'title': (item['courseTitle'] ?? 'Other').toString(),
        'videos': <Map<String, dynamic>>[],
        'quizzes': <Map<String, dynamic>>[],
        'total': 0.0,
      });
      (g[kind] as List<Map<String, dynamic>>).add(item);
      g['total'] = (g['total'] as double) + _n(item['secondsWeb']) + _n(item['secondsMobile']);
    }
    for (final v in videos) {
      bucket(v, 'videos');
    }
    for (final q in quizzes) {
      bucket(q, 'quizzes');
    }
    final groups = courses.values.toList()..sort((a, b) => (b['total'] as double).compareTo(a['total'] as double));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: groups.map((g) {
        final gVideos = List<Map<String, dynamic>>.from(g['videos'] as List)
          ..sort((a, b) => (_n(b['secondsWeb']) + _n(b['secondsMobile'])).compareTo(_n(a['secondsWeb']) + _n(a['secondsMobile'])));
        final gQuizzes = List<Map<String, dynamic>>.from(g['quizzes'] as List)
          ..sort((a, b) => (_n(b['secondsWeb']) + _n(b['secondsMobile'])).compareTo(_n(a['secondsWeb']) + _n(a['secondsMobile'])));
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          decoration: BoxDecoration(color: AppColors.surfaceAlt, borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Course header — a coloured accent bar so it reads as its own
              // block against the plain grey body below, in both themes.
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(color: _primary.withOpacity(0.14)),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(g['title'] as String,
                          style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: _textDark)),
                    ),
                    Text(_fmtSeconds(g['total'] as double), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: _primary)),
                  ],
                ),
              ),
              if (gVideos.isNotEmpty) ...[
                _sectionLabel('Videos', Icons.play_circle_outline),
                ...gVideos.asMap().entries.map((e) => _lessonRow(e.value, 'Untitled video', Icons.play_circle_outline, e.key == gVideos.length - 1 && gQuizzes.isEmpty)),
              ],
              if (gQuizzes.isNotEmpty) ...[
                _sectionLabel('Quizzes', Icons.quiz_outlined),
                ...gQuizzes.asMap().entries.map((e) => _lessonRow(e.value, 'Untitled quiz', Icons.quiz_outlined, e.key == gQuizzes.length - 1)),
              ],
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _sectionLabel(String label, IconData icon) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
      child: Row(children: [
        Icon(icon, size: 12, color: _textLight),
        const SizedBox(width: 5),
        Text(label.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: _textLight, letterSpacing: 0.5)),
      ]),
    );
  }

  Widget _lessonRow(Map<String, dynamic> item, String untitled, IconData icon, bool isLast) {
    final title = (item['title'] ?? '').toString();
    final web = _n(item['secondsWeb']);
    final mobile = _n(item['secondsMobile']);
    return Container(
      padding: EdgeInsets.fromLTRB(12, 6, 12, isLast ? 10 : 6),
      decoration: isLast ? null : BoxDecoration(border: Border(bottom: BorderSide(color: _border.withOpacity(0.5)))),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Icon(icon, size: 14, color: _textLight),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title.isEmpty ? untitled : title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _textDark)),
                const SizedBox(height: 1),
                Text('Web ${_fmtSeconds(web)} · Mobile ${_fmtSeconds(mobile)}', style: TextStyle(fontSize: 10.5, color: _textLight)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: _surface, borderRadius: BorderRadius.circular(999), border: Border.all(color: _border)),
            child: Text(_fmtSeconds(web + mobile), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _textDark)),
          ),
        ],
      ),
    );
  }
}
