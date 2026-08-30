import 'dart:async';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';

/// Mobile usage tracker. Counts ONLY the seconds the app is in the foreground,
/// and reports them to /api/activity/ping in 30-second batches (platform:
/// mobile). A shared "context" says what the rep is doing — plain app use,
/// watching a training video, or taking a quiz — so the same heartbeat feeds all
/// three totals plus the per-video breakdown. STRICTLY app usage.
class ActivityTracker {
  ActivityTracker._();
  static final ActivityTracker instance = ActivityTracker._();

  Timer? _tick;
  Timer? _flush;
  bool _started = false;
  bool _foreground = true;

  // Current context.
  String _kind = 'app'; // 'app' | 'video' | 'quiz'
  String? _courseId;
  String? _pageId;
  String? _title;

  // Accumulators since the last flush. Per-video and per-quiz seconds are held
  // in the maps below (keyed by pageId); the aggregate totals are derived on the
  // server from these items.
  int _appSec = 0;
  final Map<String, Map<String, dynamic>> _videos = {};
  final Map<String, Map<String, dynamic>> _quizzes = {};

  static const int _step = 5;

  void start() {
    if (_started) return;
    _started = true;
    _tick = Timer.periodic(const Duration(seconds: _step), (_) => _onTick());
    _flush = Timer.periodic(const Duration(seconds: 30), (_) => flush());
  }

  void dispose() {
    _tick?.cancel();
    _flush?.cancel();
    _started = false;
  }

  // Called by a lesson screen while a video / quiz is on screen; cleared on leave.
  void setContext({required String kind, String? courseId, String? pageId, String? title}) {
    _kind = kind;
    _courseId = courseId;
    _pageId = pageId;
    _title = title;
  }

  void clearContext() {
    _kind = 'app';
    _courseId = null;
    _pageId = null;
    _title = null;
  }

  void onForeground() => _foreground = true;
  void onBackground() {
    _foreground = false;
    flush(); // bank what was watched before the app went to the background
  }

  void _bump(Map<String, Map<String, dynamic>> map) {
    final id = _pageId;
    if (id == null || id.isEmpty) return;
    final cur = map[id] ??
        {'courseId': _courseId ?? '', 'pageId': id, 'title': _title ?? '', 'seconds': 0};
    cur['seconds'] = (cur['seconds'] as int) + _step;
    cur['title'] = _title ?? cur['title'];
    cur['courseId'] = _courseId ?? cur['courseId'];
    map[id] = cur;
  }

  void _onTick() {
    if (!_foreground) return;
    _appSec += _step;
    if (_kind == 'video') {
      _bump(_videos);
    } else if (_kind == 'quiz') {
      _bump(_quizzes);
    }
  }

  Map<String, dynamic>? _dominant(Map<String, Map<String, dynamic>> map) {
    if (map.isEmpty) return null;
    return map.values.reduce((a, b) => (a['seconds'] as int) >= (b['seconds'] as int) ? a : b);
  }

  Future<void> flush() async {
    if (_appSec == 0 && _videos.isEmpty && _quizzes.isEmpty) return;
    // Only report when signed in; otherwise discard so we never post as nobody.
    String? token;
    try {
      token = (await SharedPreferences.getInstance()).getString('token');
    } catch (_) {}
    if (token == null || token.isEmpty) { _reset(); return; }

    final payload = {
      'platform': 'mobile',
      'appSeconds': _appSec,
      'video': _dominant(_videos),
      'quiz': _dominant(_quizzes),
    };
    _reset();
    try {
      await api.post(
        Uri.parse('https://millerstorm.tech/api/activity/ping'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );
    } catch (_) {
      // A dropped ping just means the next batch carries the time.
    }
  }

  void _reset() {
    _appSec = 0;
    _videos.clear();
    _quizzes.clear();
  }
}
