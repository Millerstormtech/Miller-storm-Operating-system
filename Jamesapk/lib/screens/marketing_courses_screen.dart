import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:showcaseview/showcaseview.dart';
import '../services/auth_service.dart';
import 'course_detail_screen.dart';
import 'jays_ai_clone_screen.dart';
import 'ai_clone_chat_screen.dart';
import 'training_leaderboard_screen.dart';

class MarketingCoursesScreen extends StatefulWidget {
  // Which tab to open on (0 = Courses, 1 = My Playlists, 2 = Assigned). A
  // "playlist assigned" push opens straight to the Assigned tab.
  final int initialTabIndex;
  const MarketingCoursesScreen({super.key, this.initialTabIndex = 0});

  @override
  State<MarketingCoursesScreen> createState() => _MarketingCoursesScreenState();
}

class _MarketingCoursesScreenState extends State<MarketingCoursesScreen> with SingleTickerProviderStateMixin {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _blue = Color(0xFF2563EB);

  List<dynamic> _courses = [];
  List<dynamic> _filteredCourses = [];
  List<dynamic> _myPlaylists = [];
  List<dynamic> _assignedPlaylists = [];
  // Red-badge count on the Assigned tab: assignments arrived since the rep last
  // opened that tab. Clears to 0 when they open it.
  int _assignedBadge = 0;
  // AI bots assigned to this rep's panel (light payload). Drives the header
  // icon avatar and the "open chat directly" behaviour.
  List<dynamic> _jayBots = [];
  String? _jayAvatarUrl;
  bool _isLoading = true;
  bool _hasCachedData = false;
  // "Continue where you left off" — true while resolving the next lesson to open.
  bool _continuingResume = false;
  // True when the last course fetch failed (network/API) — lets the UI show a
  // "couldn't load, retry" state instead of a misleading "No courses available".
  bool _loadError = false;
  late TabController _tabController;
  String? _userId;
  final TextEditingController _searchController = TextEditingController();

  // Guided tour (Training Center) — mirrors the web: tabs, search, course grid,
  // and a "?" replay button. Auto-starts once per user/device.
  final GlobalKey _kTabs = GlobalKey();
  final GlobalKey _kSearch = GlobalKey();
  final GlobalKey _kGrid = GlobalKey();
  final GlobalKey _kReplay = GlobalKey();
  bool _tourChecked = false;
  static const _tourSeenKey = 'tour_seen_training_center_v1';
  String _searchQuery = '';
  static const String _cacheKey = 'courses_cache';
  static const String _cacheTimeKey = 'courses_cache_time';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this, initialIndex: widget.initialTabIndex);
    _tabController.addListener(_onTabChanged);
    _loadCachedJayAvatar();
    _loadData();
  }

  @override
  void dispose() {
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onTabChanged() {
    if (_tabController.indexIsChanging) return;
    if (_tabController.index == 2 && _assignedBadge > 0) _markAssignedSeen();
  }

  // Remember the current assignment count so only FUTURE assignments re-badge.
  Future<void> _markAssignedSeen() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('assigned_playlists_seen_$_userId', _assignedPlaylists.length);
    if (mounted) setState(() => _assignedBadge = 0);
  }

  Future<void> _loadData() async {
    final user = await AuthService.getStoredUser();
    _userId = user?['id'] ?? user?['_id'] ?? '';
    
    // First load cached data immediately (fast!)
    await _loadCachedCourses();
    
    // Then fetch fresh data in background
    await Future.wait([
      _fetchCourses(),
      _fetchMyPlaylists(),
      _fetchAssignedPlaylists(),
      _fetchJayAvatar(),
    ]);
  }

  // Fetch the bots assigned to this rep's panel (light payload = fast). Used for
  // the header avatar and to open the chat directly when there's a single bot.
  Future<void> _fetchJayAvatar() async {
    try {
      final user = await AuthService.getStoredUser();
      final role = user?['role']?.toString();
      final res = await api.get(Uri.parse('https://millerstorm.tech/api/ai-bots?light=1'));
      if (res.statusCode != 200) return;
      final data = json.decode(res.body) as List;
      final assigned = data.where((b) {
        final ar = b['assignedRoles'];
        return ar is List && role != null && ar.contains(role);
      }).toList();
      if (!mounted) return;
      String? avatar;
      if (assigned.isNotEmpty) {
        final raw = (assigned.first['botAvatarUrl'] ?? assigned.first['imageUrl'] ?? '').toString();
        if (raw.isNotEmpty) avatar = raw.startsWith('http') ? raw : 'https://millerstorm.tech$raw';
      }
      setState(() {
        _jayBots = assigned;
        // Only overwrite with a REAL avatar — never null out a cached one on a
        // transient/empty fetch, so the photo doesn't revert to the robot.
        if (avatar != null && avatar.isNotEmpty) _jayAvatarUrl = avatar;
      });
      // Cache it so the next app open shows the photo instantly (no robot flash).
      if (avatar != null && avatar.isNotEmpty) {
        try {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('jay_avatar_url', avatar);
        } catch (_) {}
      }
    } catch (_) {
      // Keep the fallback robot icon on any error.
    }
  }

  // Show the last-known Jay avatar from cache immediately on open, so the robot
  // icon doesn't flash before the network fetch completes.
  Future<void> _loadCachedJayAvatar() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cached = prefs.getString('jay_avatar_url');
      if (cached != null && cached.isNotEmpty && mounted) {
        setState(() => _jayAvatarUrl = cached);
      }
    } catch (_) {}
  }

  // Open Jay's AI Clone: a single bot goes straight into chat (no list screen);
  // multiple bots show the picker; none shows a toast.
  void _openJaysAi() {
    if (_jayBots.length == 1) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => AiCloneChatScreen(bot: _jayBots.first)));
    } else if (_jayBots.length > 1) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => const JaysAiCloneScreen()));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No AI assistant available yet')),
      );
    }
  }

  Future<void> _loadCachedCourses() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedJson = prefs.getString(_cacheKey);

      // Stale-while-revalidate: always show the last-known courses instantly
      // (any age) so the user never sees a blank/"no courses" screen while the
      // fresh fetch runs in the background. _fetchCourses refreshes right after.
      if (cachedJson != null) {
        final data = jsonDecode(cachedJson);
        List<dynamic> courses = data is List ? data : [];
        if (courses.isNotEmpty) {
          courses.sort((a, b) {
            final orderA = a['order'] ?? 999;
            final orderB = b['order'] ?? 999;
            return orderA.compareTo(orderB);
          });

          if (mounted) {
            setState(() {
              _courses = courses;
              _filteredCourses = courses;
              _hasCachedData = true;
              _isLoading = false;
            });
          }
        }
      }
    } catch (e) {
      print('Error loading cached courses: $e');
    }
  }

  Future<void> _saveCachedCourses(List<dynamic> courses) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey, jsonEncode(courses));
      await prefs.setInt(_cacheTimeKey, DateTime.now().millisecondsSinceEpoch);
    } catch (e) {
      print('Error saving cached courses: $e');
    }
  }

  Future<void> _fetchCourses() async {
    final user = await AuthService.getStoredUser();
    final userId = user?['id'] ?? '';
    final userRole = user?['role'] ?? '';
    final url = Uri.parse(
        'https://millerstorm.tech/api/courses?userId=$userId&userRole=$userRole&list=true');

    // list=true → server strips heavy per-page content (HTML body, video
    // transcript, quiz questions) that the list doesn't need, so it loads fast.
    // Retry a few times with a per-request timeout so a slow/blip response
    // doesn't leave the user on a false "No courses available" screen.
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        final response =
            await api.get(url).timeout(const Duration(seconds: 10));

        if (response.statusCode == 200) {
          final data = jsonDecode(response.body);
          List<dynamic> courses = data is List ? data : [];
          courses.sort((a, b) {
            final orderA = a['order'] ?? 999;
            final orderB = b['order'] ?? 999;
            return orderA.compareTo(orderB);
          });

          await _saveCachedCourses(courses);

          if (mounted) {
            setState(() {
              _courses = courses;
              _filteredCourses = _searchQuery.isEmpty
                  ? courses
                  : courses.where((c) => _courseMatchesQuery(c, _searchQuery)).toList();
              _isLoading = false;
              _loadError = false;
            });
          }
          return; // success
        }
        // Non-200: retry unless it's the last attempt.
        if (attempt < 2) {
          await Future.delayed(Duration(milliseconds: 600 * (attempt + 1)));
          continue;
        }
      } catch (e) {
        print('Error fetching courses (attempt ${attempt + 1}): $e');
        if (attempt < 2) {
          await Future.delayed(Duration(milliseconds: 600 * (attempt + 1)));
          continue;
        }
      }
    }

    // All attempts failed. Keep any cached courses on screen; only flag an error
    // (so the UI shows "couldn't load, retry" instead of "No courses available").
    if (mounted) {
      setState(() {
        _isLoading = false;
        if (_courses.isEmpty) _loadError = true;
      });
    }
  }

  void _filterCourses(String query) {
    setState(() {
      _searchQuery = query.toLowerCase();
      if (_searchQuery.isEmpty) {
        _filteredCourses = _courses;
      } else {
        _filteredCourses =
            _courses.where((course) => _courseMatchesQuery(course, _searchQuery)).toList();
      }
    });
  }

  // Matches a course by its title/description OR by any individual video/lesson
  // title inside it (course['pages']). Quizzes are ignored so only real
  // videos/lessons count. `query` is expected already lower-cased.
  bool _courseMatchesQuery(dynamic course, String query) {
    final title = (course['title'] ?? '').toString().toLowerCase();
    final description = (course['description'] ?? '').toString().toLowerCase();
    if (title.contains(query) || description.contains(query)) return true;
    final pages = (course['pages'] as List<dynamic>? ?? []);
    return pages.any((p) =>
        p['isQuiz'] != true &&
        (p['title'] ?? '').toString().toLowerCase().contains(query));
  }

  Future<void> _fetchMyPlaylists() async {
    if (_userId == null || _userId!.isEmpty) return;
    try {
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/playlists?managerId=$_userId'),
      );
      if (response.statusCode == 200) {
        setState(() {
          _myPlaylists = jsonDecode(response.body);
        });
      }
    } catch (e) {
      print('Error fetching my playlists: $e');
    }
  }

  Future<void> _fetchAssignedPlaylists() async {
    if (_userId == null || _userId!.isEmpty) return;
    try {
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/playlist-assignments?userId=$_userId'),
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final prefs = await SharedPreferences.getInstance();
        final seen = prefs.getInt('assigned_playlists_seen_$_userId') ?? 0;
        final total = (data is List) ? data.length : 0;
        if (!mounted) return;
        setState(() {
          _assignedPlaylists = data;
          _assignedBadge = (total - seen) > 0 ? (total - seen) : 0;
        });
        // Already viewing the Assigned tab (e.g. opened from a push) → clear.
        if (_tabController.index == 2 && _assignedBadge > 0) _markAssignedSeen();
      }
    } catch (e) {
      print('Error fetching assigned playlists: $e');
    }
  }

  Future<void> _deletePlaylist(String playlistId) async {
    try {
      final response = await api.delete(
        Uri.parse('https://millerstorm.tech/api/playlists?id=$playlistId'),
      );
      if (response.statusCode == 200) {
        await _fetchMyPlaylists();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Playlist deleted successfully')),
        );
      }
    } catch (e) {
      print('Error deleting playlist: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    // Wrap in ShowCaseWidget so the Training Center tour can spotlight elements.
    return ShowCaseWidget(
      blurValue: 0.4,
      builder: (context) => _buildScaffold(context),
    );
  }

  Widget _buildScaffold(BuildContext context) {
    // Auto-start the tour once per user, after courses have loaded.
    if (!_isLoading && !_tourChecked) {
      _tourChecked = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _maybeAutoStartTour(context));
    }
    return WillPopScope(
      onWillPop: () async {
        // Prevent back button from exiting app
        return false;
      },
      child: Scaffold(
        backgroundColor: _bg,
        appBar: AppBar(
        backgroundColor: _white,
        elevation: 0,
        title: const Text(
          'Training Center',
          style: TextStyle(color: _textDark, fontSize: 18, fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            icon: _jayAvatarUrl != null
                ? Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      image: DecorationImage(image: NetworkImage(_jayAvatarUrl!), fit: BoxFit.cover),
                    ),
                  )
                : const Icon(Icons.smart_toy_outlined, color: _primary, size: 26),
            tooltip: "Jay's AI Clone",
            onPressed: _openJaysAi,
          ),
          IconButton(
            icon: const Text('🏆', style: TextStyle(fontSize: 26)),
            onPressed: () {
              Navigator.pushNamed(context, '/marketing-training-leaderboard');
            },
          ),
          Showcase(
            key: _kReplay,
            title: 'Replay anytime',
            description: 'Tap here to replay this quick tour whenever you want a refresher.',
            child: IconButton(
              icon: const Icon(Icons.help_outline, color: _textLight, size: 24),
              tooltip: 'Guided tour',
              onPressed: () => _startTour(context),
            ),
          ),
          const SizedBox(width: 4),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Showcase(
            key: _kTabs,
            title: 'Your training areas',
            description: 'Courses holds the full library, My Playlists is where you build custom lesson lists, and Assigned Playlists shows what your manager sent you.',
            child: TabBar(
              controller: _tabController,
              labelColor: _blue,
              unselectedLabelColor: _textLight,
              indicatorColor: _blue,
              labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              tabs: [
                const Tab(text: 'Courses'),
                const Tab(text: 'My Playlists'),
                Tab(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Assigned'),
                      if (_assignedBadge > 0) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          constraints: const BoxConstraints(minWidth: 18),
                          decoration: BoxDecoration(color: _primary, borderRadius: BorderRadius.circular(10)),
                          alignment: Alignment.center,
                          child: Text('$_assignedBadge',
                              style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildCoursesTab(),
                _buildMyPlaylistsTab(),
                _buildAssignedPlaylistsTab(),
              ],
            ),
          ),
          _buildBottomNav(),
        ],
      ),
      ),
    );
  }

  // Walk the tour: tabs -> search -> a course card -> the replay button. The
  // search + grid live on the Courses tab, so jump there first if needed.
  void _startTour(BuildContext context) {
    void run() {
      final keys = <GlobalKey>[_kTabs, _kSearch];
      if (_filteredCourses.isNotEmpty) keys.add(_kGrid);
      keys.add(_kReplay);
      ShowCaseWidget.of(context).startShowCase(keys);
    }
    if (_tabController.index != 0) {
      _tabController.animateTo(0);
      WidgetsBinding.instance.addPostFrameCallback((_) => run());
    } else {
      run();
    }
  }

  // First visit only: run the tour once, then remember it per user/device.
  Future<void> _maybeAutoStartTour(BuildContext context) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool(_tourSeenKey) == true) return;
      await prefs.setBool(_tourSeenKey, true);
      if (!mounted) return;
      _startTour(context);
    } catch (_) {}
  }

  // The course to resume: the first started-but-unfinished course
  // (0 < progress < 100). Matches the web's "Continue where you left off".
  Map<String, dynamic>? get _resumeCourse {
    for (final c in _courses) {
      if (c is! Map) continue;
      final pctRaw = (c['progress']?['progressPercent'] ?? 0);
      final pct = pctRaw is num ? pctRaw.toInt() : 0;
      if (pct > 0 && pct < 100) return Map<String, dynamic>.from(c);
    }
    return null;
  }

  // Load the course's per-lesson progress, find the next unwatched lesson, and
  // open the course straight into that lesson's player (via initialPageId).
  Future<void> _continueWhereLeftOff(Map<String, dynamic> course) async {
    if (_continuingResume) return;
    setState(() => _continuingResume = true);
    try {
      final courseId = (course['id'] ?? '').toString();
      Set<String> done = {};
      List<dynamic> quizResults = [];
      try {
        final res = await api.get(Uri.parse(
            'https://millerstorm.tech/api/progress?userId=$_userId&courseId=$courseId'));
        if (res.statusCode == 200) {
          final data = json.decode(res.body);
          done = ((data['completedPages'] as List?) ?? []).map((e) => e.toString()).toSet();
          quizResults = (data['quizResults'] as List?) ?? [];
        }
      } catch (_) {}

      final pages = ((course['pages'] as List?) ?? [])
          .where((p) => p is Map && p['status'] == 'published')
          .toList();
      bool isDone(dynamic p) {
        final id = (p['id'] ?? '').toString();
        if (p['isQuiz'] == true) {
          return quizResults.any((r) => (r['pageId'] ?? '').toString() == id && r['passed'] != false);
        }
        return done.contains(id);
      }

      // First not-yet-watched video; else the next incomplete item; else page one.
      dynamic next;
      for (final p in pages) {
        if (p['isQuiz'] != true && !isDone(p)) { next = p; break; }
      }
      if (next == null) {
        for (final p in pages) { if (!isDone(p)) { next = p; break; } }
      }
      next ??= pages.isNotEmpty ? pages.first : null;

      if (!mounted) return;
      final nextId = next != null ? (next['id'] ?? '').toString() : '';
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => CourseDetailScreen(
            courseId: courseId,
            courseTitle: (course['title'] ?? '').toString(),
            initialPageId: nextId.isNotEmpty ? nextId : null,
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _continuingResume = false);
    }
  }

  // The exciting red "Continue where you left off!" banner.
  Widget _buildResumeBanner() {
    final course = _resumeCourse;
    if (course == null) return const SizedBox.shrink();
    final title = (course['title'] ?? '').toString();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: GestureDetector(
        onTap: _continuingResume ? null : () => _continueWhereLeftOff(course),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xFFB30002), Color(0xFFE01418)]),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [BoxShadow(color: _primary.withOpacity(0.35), blurRadius: 16, offset: const Offset(0, 6))],
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), shape: BoxShape.circle),
                child: _continuingResume
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 28),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Continue where you left off!',
                        style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.white.withOpacity(0.9), fontSize: 13)),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 22),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCoursesTab() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: _primary));
    }
    return Column(
      children: [
        Showcase(
          key: _kSearch,
          title: 'Find anything fast',
          description: 'Type a course name here to filter the library.',
          child: Container(
          color: _white,
          padding: const EdgeInsets.all(16),
          child: TextField(
            controller: _searchController,
            onChanged: _filterCourses,
            decoration: InputDecoration(
              hintText: 'Search courses...',
              hintStyle: TextStyle(color: _textLight, fontSize: 14),
              prefixIcon: const Icon(Icons.search, color: _textLight),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, color: _textLight),
                      onPressed: () {
                        _searchController.clear();
                        _filterCourses('');
                      },
                    )
                  : null,
              filled: true,
              fillColor: _bg,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
        ),
        ),
        _buildResumeBanner(),
        Expanded(
          child: _filteredCourses.isEmpty
              ? (_loadError && _searchQuery.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.cloud_off, size: 64, color: _textLight.withOpacity(0.4)),
                          const SizedBox(height: 16),
                          const Text(
                            "Couldn't load courses",
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: _textDark),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Check your internet connection and try again.',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 14, color: _textLight),
                          ),
                          const SizedBox(height: 20),
                          ElevatedButton.icon(
                            onPressed: () {
                              setState(() { _isLoading = true; _loadError = false; });
                              _loadData();
                            },
                            icon: const Icon(Icons.refresh),
                            label: const Text('Retry'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                : Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.search_off, size: 64, color: _textLight.withOpacity(0.3)),
                        const SizedBox(height: 16),
                        Text(
                          _searchQuery.isEmpty ? 'No courses available' : 'No courses found',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: _textDark),
                        ),
                        if (_searchQuery.isNotEmpty) const SizedBox(height: 8),
                        if (_searchQuery.isNotEmpty) Text(
                          'Try searching with different keywords',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 14, color: _textLight),
                        ),
                      ],
                    ),
                  ),
                ))
              : RefreshIndicator(
                  color: _primary,
                  onRefresh: () async {
                    setState(() => _isLoading = true);
                    await _loadData();
                  },
                  child: Builder(
                    builder: (context) {
                      // Group courses under category section headings (like the
                      // web Training Center). Uncategorized courses render last
                      // with no heading.
                      final items = _groupCoursesByCategory(_filteredCourses);
                      final firstCourseIdx = items.indexWhere(
                          (it) => !(it is Map && it.containsKey('__header__')));
                      return ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: items.length,
                        itemBuilder: (context, index) {
                          final item = items[index];
                          if (item is Map && item.containsKey('__header__')) {
                            return _categoryHeader(item['__header__'] as String);
                          }
                          final course = item;
                          final Widget card = Padding(
                            padding: const EdgeInsets.only(bottom: 16),
                            child: GestureDetector(
                              onTap: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (context) => CourseDetailScreen(
                                      courseId: course['id'] ?? '',
                                      courseTitle: course['title'] ?? 'Course',
                                    ),
                                  ),
                                ).then((_) => _loadData());
                              },
                              child: _buildCourseCard(
                                course['title'] ?? 'Untitled',
                                '${course['progress']?['progressPercent'] ?? 0}%',
                                _getCourseIcon(course['icon']),
                                course['coverImageUrl'],
                                description: (course['description'] ?? '').toString(),
                              ),
                            ),
                          );
                          // Spotlight the first course card for the tour.
                          if (index == firstCourseIdx) {
                            return Showcase(
                              key: _kGrid,
                              title: 'Pick a course',
                              description: 'Each card shows your progress. Tap a course to open it and continue where you left off.',
                              child: card,
                            );
                          }
                          return card;
                        },
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }

  // Group courses into category sections. Predefined categories first (in the
  // web's order), then any custom categories (alphabetical), then uncategorized
  // courses last WITHOUT a heading. Header entries are marked with '__header__'.
  List<dynamic> _groupCoursesByCategory(List<dynamic> courses) {
    // MUST match TRAINING_CATEGORIES in src/lib/training/categories.ts. Used for
    // section ORDER only, so a stale entry misplaces a heading rather than
    // hiding a course, but it should still be kept in step.
    const predefined = [
      'Miller Storm Certificate',
      'Millionaire Knockers',
      'Roof Hustlers',
    ];
    // Retired spellings still stored on some courses, folded onto the name in
    // use so a library mid-rename shows ONE section, not an old and a new one.
    // Mirrors canonicalCategory() in src/lib/training/credentials.ts.
    const aliases = {'Miller Storm Diploma': 'Miller Storm Certificate'};
    final byCat = <String, List<dynamic>>{};
    for (final c in courses) {
      final raw = (c['category'] ?? '').toString().trim();
      final cat = aliases[raw] ?? raw;
      byCat.putIfAbsent(cat.isEmpty ? '__none__' : cat, () => <dynamic>[]).add(c);
    }
    final ordered = <String>[];
    for (final p in predefined) {
      if (byCat.containsKey(p)) ordered.add(p);
    }
    final custom = byCat.keys.where((k) => k != '__none__' && !predefined.contains(k)).toList()
      ..sort();
    ordered.addAll(custom);
    final items = <dynamic>[];
    for (final cat in ordered) {
      items.add({'__header__': cat});
      items.addAll(byCat[cat]!);
    }
    if (byCat.containsKey('__none__')) items.addAll(byCat['__none__']!);
    return items;
  }

  Widget _categoryHeader(String name) {
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 12),
      child: Row(
        children: [
          Container(
            width: 16,
            height: 3,
            decoration: BoxDecoration(color: const Color(0xFFE01418), borderRadius: BorderRadius.circular(2)),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              name.toUpperCase(),
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: 0.5, color: _textDark),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMyPlaylistsTab() {
    if (_myPlaylists.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.playlist_add, size: 64, color: _textLight.withOpacity(0.3)),
              const SizedBox(height: 16),
              const Text(
                'No Playlists Yet',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: _textDark),
              ),
              const SizedBox(height: 8),
              Text(
                'Create a playlist by clicking "Make Playlist" when viewing a course',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: _textLight),
              ),
            ],
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _myPlaylists.length,
      itemBuilder: (context, index) {
        final playlist = _myPlaylists[index];
        return _buildPlaylistCard(playlist, false);
      },
    );
  }

  Widget _buildAssignedPlaylistsTab() {
    if (_assignedPlaylists.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.assignment, size: 64, color: _textLight.withOpacity(0.3)),
              const SizedBox(height: 16),
              const Text(
                'No Assigned Playlists',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: _textDark),
              ),
              const SizedBox(height: 8),
              Text(
                'Your Sales Team Lead hasn\'t assigned any playlists yet',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: _textLight),
              ),
            ],
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _assignedPlaylists.length,
      itemBuilder: (context, index) {
        final assignment = _assignedPlaylists[index];
        return _buildPlaylistCard(assignment, true);
      },
    );
  }

  Widget _buildPlaylistCard(Map<String, dynamic> data, bool isAssigned) {
    final playlistName = isAssigned ? data['playlistName'] : data['name'];
    final courseName = data['courseName'];
    final moduleCount = (data['selectedModules'] as List?)?.length ?? 0;
    final managerName = isAssigned ? data['managerName'] : null;
    final playlistId = data['_id'] ?? data['id'];
    final courseId = data['courseId'];

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      playlistName ?? 'Untitled Playlist',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: _textDark,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Course: $courseName',
                      style: const TextStyle(fontSize: 13, color: _textLight),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '$moduleCount module${moduleCount != 1 ? 's' : ''}',
                      style: const TextStyle(fontSize: 13, color: _textLight),
                    ),
                    if (managerName != null) const SizedBox(height: 2),
                    if (managerName != null) Text(
                      'Assigned by: $managerName',
                      style: TextStyle(
                        fontSize: 12,
                        color: _textLight,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ElevatedButton(
                  onPressed: () {
                    // Navigate to course detail with playlist filter
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => CourseDetailScreen(
                          courseId: courseId,
                          courseTitle: courseName,
                          playlistModules: List<String>.from(data['selectedModules'] ?? []),
                        ),
                      ),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _primary,
                    foregroundColor: _white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: const Text('View'),
                ),
              ),
              if (!isAssigned) const SizedBox(width: 8),
              if (!isAssigned) ElevatedButton(
                  onPressed: () {
                    showDialog(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text('Delete Playlist'),
                        content: const Text('Are you sure you want to delete this playlist?'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Cancel'),
                          ),
                          TextButton(
                            onPressed: () {
                              Navigator.pop(context);
                              _deletePlaylist(playlistId);
                            },
                            child: const Text('Delete', style: TextStyle(color: Colors.red)),
                          ),
                        ],
                      ),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red.shade50,
                    foregroundColor: Colors.red,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: const Text('Delete'),
                ),
            ],
          ),
        ],
      ),
    );
  }

  IconData _getCourseIcon(String? iconText) {
    if (iconText == '🚪') return Icons.door_front_door;
    if (iconText == '🎯') return Icons.track_changes;
    return Icons.school_outlined;
  }

  Widget _buildCourseCard(String title, String progress, IconData icon, String? coverImageUrl, {String? description}) {
    final progressValue = int.parse(progress.replaceAll('%', ''));
    String statusText = '';
    Color statusColor = _primary;
    
    if (progressValue == 100) {
      statusText = 'COMPLETED';
      statusColor = const Color(0xFF16A34A); // Green
    } else if (progressValue == 0) {
      statusText = 'NOT STARTED';
      statusColor = const Color(0xFF6B7280); // Gray
    } else {
      statusText = 'IN PROGRESS';
      statusColor = _primary; // Red
    }
    
    return Container(
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              Container(
                height: 160,
                decoration: BoxDecoration(
                  gradient: coverImageUrl == null || coverImageUrl.isEmpty
                      ? LinearGradient(
                          colors: [_primary, _primary.withOpacity(0.8)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        )
                      : null,
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(16),
                    topRight: Radius.circular(16),
                  ),
                ),
                child: coverImageUrl != null && coverImageUrl.isNotEmpty
                    ? ClipRRect(
                        borderRadius: const BorderRadius.only(
                          topLeft: Radius.circular(16),
                          topRight: Radius.circular(16),
                        ),
                        child: coverImageUrl.startsWith('data:image/')
                            ? Image.memory(
                                base64Decode(coverImageUrl.split(',')[1]),
                                width: double.infinity,
                                height: 160,
                                fit: BoxFit.cover,
                                cacheWidth: 400,
                                errorBuilder: (context, error, stackTrace) {
                                  return Container(
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        colors: [_primary, _primary.withOpacity(0.8)],
                                        begin: Alignment.topLeft,
                                        end: Alignment.bottomRight,
                                      ),
                                    ),
                                    child: Center(
                                      child: Icon(icon, size: 64, color: _white),
                                    ),
                                  );
                                },
                              )
                            : CachedNetworkImage(
                                imageUrl: coverImageUrl,
                                width: double.infinity,
                                height: 160,
                                fit: BoxFit.cover,
                                memCacheWidth: 400,
                                placeholder: (context, url) => Container(
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(
                                      colors: [_primary.withOpacity(0.6), _primary.withOpacity(0.4)],
                                      begin: Alignment.topLeft,
                                      end: Alignment.bottomRight,
                                    ),
                                  ),
                                  child: Center(child: CircularProgressIndicator(color: _white, strokeWidth: 2)),
                                ),
                                errorWidget: (context, url, error) {
                                  return Container(
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        colors: [_primary, _primary.withOpacity(0.8)],
                                        begin: Alignment.topLeft,
                                        end: Alignment.bottomRight,
                                      ),
                                    ),
                                    child: Center(
                                      child: Icon(icon, size: 64, color: _white),
                                    ),
                                  );
                                },
                              ),
                      )
                    : Center(
                        child: Icon(icon, size: 64, color: _white),
                      ),
              ),
              Positioned(
                top: 12,
                left: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    statusText,
                    style: const TextStyle(
                      color: _white,
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: _textDark,
                  ),
                ),
                if (description != null && description.trim().isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    description.trim(),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, height: 1.35, color: _textLight),
                  ),
                ],
                const SizedBox(height: 12),
                // Completion progress bar + percentage (matches the web card).
                Row(
                  children: [
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: LinearProgressIndicator(
                          value: (progressValue / 100).clamp(0.0, 1.0),
                          minHeight: 6,
                          backgroundColor: _bg,
                          valueColor: AlwaysStoppedAnimation<Color>(
                              progressValue == 100 ? const Color(0xFF16A34A) : _primary),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      '$progressValue%',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: progressValue == 100 ? const Color(0xFF16A34A) : _primary,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomNav() {
    return Container(
      decoration: BoxDecoration(
        color: _white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _navItem(Icons.leaderboard_outlined, 'Sales', '/marketing-rankings'),
              const SizedBox(width: 2),
              _navItem(Icons.chat_bubble, 'StormChat', '/marketing-stormchat'),
              const SizedBox(width: 2),
              _navItem(Icons.apps, 'Tools', '/marketing-apps-tools-items'),
              const SizedBox(width: 2),
              _navItemActive(Icons.school, 'Training'),
              const SizedBox(width: 2),
              _navItem(Icons.person, 'Profile', '/marketing-profile'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItem(IconData icon, String label, String route) {
    return Expanded(
      child: GestureDetector(
        onTap: () => Navigator.pushReplacementNamed(context, route),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: _textLight, size: 24),
              const SizedBox(height: 4),
              Text(
                label,
                style: const TextStyle(fontSize: 10, color: _textLight),
                maxLines: 1,
                softWrap: false,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItemActive(IconData icon, String label) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: _primary.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: _primary, size: 24),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(fontSize: 10, color: _primary, fontWeight: FontWeight.w600),
              maxLines: 1,
              softWrap: false,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
