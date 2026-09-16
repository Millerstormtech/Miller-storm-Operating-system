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

  // Wall-clock start of the current foreground accounting period. Comparing
  // real elapsed time against this (instead of only counting whole _step
  // ticks) means a session that ends after 1 second still banks that 1
  // second instead of being dropped for never reaching a tick boundary.
  DateTime? _periodStart;

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
  // Guards against one huge dump if the process was suspended (e.g. device
  // sleep) between accounting points instead of cleanly backgrounding.
  static const int _maxAccumulateSec = 60;

  void start() {
    if (_started) return;
    _started = true;
    _periodStart = DateTime.now();
    print('[ActivityTracker] Starting mobile tracker...');
    _tick = Timer.periodic(const Duration(seconds: _step), (_) => _accumulate());
    _flush = Timer.periodic(const Duration(seconds: 30), (_) => flush());
    print('[ActivityTracker] Mobile tracker started! Tick every ${_step}s, flush every 30s');
  }

  void dispose() {
    _accumulate();
    _tick?.cancel();
    _flush?.cancel();
    _started = false;
  }

  // Called by a lesson screen while a video / quiz is on screen; cleared on leave.
  void setContext({required String kind, String? courseId, String? pageId, String? title}) {
    _accumulate(); // bank time under the previous context before switching
    _kind = kind;
    _courseId = courseId;
    _pageId = pageId;
    _title = title;
  }

  void clearContext() {
    _accumulate();
    _kind = 'app';
    _courseId = null;
    _pageId = null;
    _title = null;
  }

  void onForeground() {
    _foreground = true;
    _periodStart = DateTime.now();
  }

  void onBackground() {
    _accumulate(); // bank what was used before the app went to the background
    _foreground = false;
    flush();
  }

  void _bump(Map<String, Map<String, dynamic>> map, int secs) {
    final id = _pageId;
    if (id == null || id.isEmpty || secs <= 0) return;
    final cur = map[id] ??
        {'courseId': _courseId ?? '', 'pageId': id, 'title': _title ?? '', 'seconds': 0};
    cur['seconds'] = (cur['seconds'] as int) + secs;
    cur['title'] = _title ?? cur['title'];
    cur['courseId'] = _courseId ?? cur['courseId'];
    map[id] = cur;
  }

  // Bank whatever real time elapsed since the last accounting point, however
  // short. This is what guarantees a session that lasts only 1 second still
  // gets credited instead of being silently rounded down to zero.
  void _accumulate() {
    if (!_foreground || _periodStart == null) return;
    final now = DateTime.now();
    final elapsedMs = now.difference(_periodStart!).inMilliseconds;
    _periodStart = now;
    if (elapsedMs <= 0) return;
    final elapsedSec = (elapsedMs / 1000).round().clamp(1, _maxAccumulateSec);
    _appSec += elapsedSec;
    if (_kind == 'video') {
      _bump(_videos, elapsedSec);
    } else if (_kind == 'quiz') {
      _bump(_quizzes, elapsedSec);
    }
    print('[ActivityTracker] Accumulate: +${elapsedSec}s appSec=$_appSec, kind=$_kind, videos=${_videos.length}, quizzes=${_quizzes.length}, fg=$_foreground');
  }

  Future<void> flush() async {
    _accumulate(); // capture any partial time since the last tick before sending
    if (_appSec == 0 && _videos.isEmpty && _quizzes.isEmpty) return;
    // Only report when signed in; otherwise discard so we never post as nobody.
    String? token;
    try {
      token = (await SharedPreferences.getInstance()).getString('token');
    } catch (_) {}
    if (token == null || token.isEmpty) { 
      print('[ActivityTracker] No token, skipping flush');
      _reset(); 
      return; 
    }

    final payload = {
      'platform': 'mobile',
      'appSeconds': _appSec,
      'videos': _videos.values.toList(),
      'quizzes': _quizzes.values.toList(),
    };
    print('[ActivityTracker] Flushing: $payload');
    _reset();
    try {
      final response = await api.post(
        Uri.parse('https://millerstorm.tech/api/activity/ping'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );
      print('[ActivityTracker] Ping response: ${response.statusCode}');
    } catch (e) {
      print('[ActivityTracker] Ping failed: $e');
    }
  }

  void _reset() {
    _appSec = 0;
    _videos.clear();
    _quizzes.clear();
  }
}
