import 'dart:convert';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_client.dart';

/// Managers unlock a specific lesson/quiz for team members without them watching
/// it. Unlock is stored separately from completed pages (never counts toward
/// progress %); each member is notified. Reached from the View Team page.
/// Two-step flow: pick many members, then bulk-unlock lessons/quizzes (and
/// optionally toggle fast-forward) for all of them at once — mirrors the web.
class BranchManagerUnlockLessonScreen extends StatefulWidget {
  const BranchManagerUnlockLessonScreen({super.key});

  @override
  State<BranchManagerUnlockLessonScreen> createState() => _BranchManagerUnlockLessonScreenState();
}

class _BranchManagerUnlockLessonScreenState extends State<BranchManagerUnlockLessonScreen> {
  Color get _bg => AppColors.bg;
  Color get _white => AppColors.surface;
  static const _primary = Color(0xFFCB0002);
  Color get _textDark => AppColors.textDark;
  Color get _textLight => AppColors.textLight;
  static const _blue = Color(0xFF2563EB);

  String _managerId = '';
  bool _loading = true;
  List<dynamic> _team = [];
  List<dynamic> _courses = [];

  // Step 1: pick many members. Step 2: pick lessons/quizzes for all of them.
  final Set<String> _selectedMemberIds = {};
  bool _pickingMembers = true;
  // Selected page keys "courseId::pageId".
  final Set<String> _selected = {};
  bool _busy = false;
  bool _ffBusy = false;
  String _search = '';
  // Courses collapsed in the unlock list (arrow toggles). A search always
  // shows matches expanded regardless of this set.
  final Set<String> _collapsedCourses = <String>{};
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        _managerId = (user['id'] ?? user['_id'] ?? '').toString();
      }
      // Cache-first: fill the course list instantly from the list already cached
      // by the Courses screen, so the unlock view shows the same courses as the
      // web even when the network is slow/timing out (course list = light pages).
      await _loadCachedCourses();
      // Show the member list the moment the team loads. The course list is only
      // needed once members are picked (and is already cache-filled above), so it
      // must not gate the initial list behind a second, heavier request.
      await _fetchTeam();
      if (mounted) setState(() => _loading = false);
      await _fetchCourses();
    } catch (e) {
      print('Unlock init error: $e');
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadCachedCourses() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedJson = prefs.getString('courses_cache');
      if (cachedJson == null) return;
      final data = jsonDecode(cachedJson);
      if (data is List && data.isNotEmpty && _courses.isEmpty) {
        if (mounted) setState(() => _courses = data);
      }
    } catch (e) {
      print('Unlock loadCachedCourses error: $e');
    }
  }

  Future<void> _fetchTeam() async {
    // lite=1 → light payload (id/name/email/photo/status only), not the full
    // user docs, so the team list opens fast.
    // Branch Manager unlocks for ANY sales rep (company-wide).
    final url = Uri.parse('https://millerstorm.tech/api/users?role=sales&lite=1');
    // Retry a few times — on the iOS simulator the initial request burst can
    // make a single call time out, which would leave the list empty.
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        final res = await api.get(url).timeout(const Duration(seconds: 12));
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          _team = data is List ? data.where((u) => u['deleted'] != true).toList() : [];
          return;
        }
      } catch (e) {
        print('Unlock fetchTeam error (attempt ${attempt + 1}): $e');
      }
      if (attempt < 2) await Future.delayed(Duration(milliseconds: 600 * (attempt + 1)));
    }
  }

  Future<void> _fetchCourses() async {
    final url = Uri.parse('https://millerstorm.tech/api/courses?userId=$_managerId&userRole=branch-manager&list=1');
    // Retry so a timed-out first attempt doesn't show a false "No courses found".
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        final res = await api.get(url).timeout(const Duration(seconds: 12));
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          if (data is List && data.isNotEmpty) {
            // App shows only PUBLISHED courses (API returns drafts to leadership).
            final published = data.where((c) => c['status'] == 'published').toList();
            _courses = published;
            // Refresh the shared cache so the next open (and other screens) are
            // instant even offline.
            try {
              final prefs = await SharedPreferences.getInstance();
              await prefs.setString('courses_cache', jsonEncode(published));
            } catch (_) {}
          }
          return;
        }
      } catch (e) {
        print('Unlock fetchCourses error (attempt ${attempt + 1}): $e');
      }
      if (attempt < 2) await Future.delayed(Duration(milliseconds: 600 * (attempt + 1)));
    }
  }

  // ---- Step 1: member multi-select ----

  void _toggleMember(String id) {
    if (id.isEmpty) return;
    setState(() {
      if (_selectedMemberIds.contains(id)) {
        _selectedMemberIds.remove(id);
      } else {
        _selectedMemberIds.add(id);
      }
    });
  }

  List<String> _allMemberIds() => _team
      .map((m) => (m['id'] ?? m['_id'] ?? '').toString())
      .where((s) => s.isNotEmpty)
      .toList();

  void _toggleSelectAllMembers() {
    final allIds = _allMemberIds();
    setState(() {
      final allSelected = allIds.isNotEmpty && allIds.every(_selectedMemberIds.contains);
      if (allSelected) {
        _selectedMemberIds.clear();
      } else {
        _selectedMemberIds
          ..clear()
          ..addAll(allIds);
      }
    });
  }

  // ---- Step 2: lesson/quiz selection ----

  void _toggleSelect(String courseId, String pageId) {
    final key = '$courseId::$pageId';
    setState(() {
      if (_selected.contains(key)) {
        _selected.remove(key);
      } else {
        _selected.add(key);
      }
    });
  }

  // Keys of every (published) page in a course — with many members we no longer
  // show per-member unlocked/completed status, so every lesson/quiz is selectable.
  Widget _chooseChip(String label, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: active ? _blue.withOpacity(0.20) : _blue.withOpacity(0.12),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: _blue.withOpacity(0.4)),
        ),
        child: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _blue)),
      ),
    );
  }

  List<String> _pageKeys(String courseId, List pages) => pages
      .map((p) => '$courseId::${(p['id'] ?? '').toString()}')
      .toList();

  // Select (or clear) the whole course at once, so a manager can unlock every
  // lesson/quiz in one go via the existing "Unlock selected" button.
  void _toggleSelectWholeCourse(String courseId, List pages) {
    final keys = _pageKeys(courseId, pages);
    if (keys.isEmpty) return;
    setState(() {
      final allSelected = keys.every(_selected.contains);
      if (allSelected) {
        _selected.removeAll(keys);
      } else {
        _selected.addAll(keys);
      }
    });
  }

  Future<void> _unlockSelected() async {
    if (_selected.isEmpty || _selectedMemberIds.isEmpty) return;
    setState(() => _busy = true);
    final ids = _selectedMemberIds.toList();
    // Group selected page ids by course, then send one request per course.
    final byCourse = <String, List<String>>{};
    for (final key in _selected) {
      final parts = key.split('::');
      byCourse.putIfAbsent(parts[0], () => []).add(parts[1]);
    }
    try {
      for (final entry in byCourse.entries) {
        final course = _courses.firstWhere((c) => (c['id'] ?? '').toString() == entry.key, orElse: () => null);
        await api.post(
          Uri.parse('https://millerstorm.tech/api/manager/unlock-lesson'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'memberUserIds': ids,
            'courseId': entry.key,
            'pageIds': entry.value,
            'action': 'unlock',
            'courseName': course?['title'] ?? '',
          }),
        ).timeout(const Duration(seconds: 25));
      }
      if (mounted) {
        setState(() { _selected.clear(); _busy = false; });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Unlocked for ${ids.length} member${ids.length == 1 ? '' : 's'} — they\'ve been notified.'),
            backgroundColor: _primary,
          ),
        );
      }
    } catch (e) {
      print('Unlock error: $e');
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not unlock. Please try again.')),
        );
      }
    }
  }

  Future<void> _setFastForward(bool allowed) async {
    if (_selectedMemberIds.isEmpty) return;
    setState(() => _ffBusy = true);
    final ids = _selectedMemberIds.toList();
    try {
      await api.post(
        Uri.parse('https://millerstorm.tech/api/manager/allow-fast-forward'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'memberUserIds': ids, 'allowed': allowed}),
      ).timeout(const Duration(seconds: 25));
      if (mounted) {
        setState(() => _ffBusy = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(allowed
                ? 'Fast-forward enabled for ${ids.length} member${ids.length == 1 ? '' : 's'}.'
                : 'Fast-forward disabled for ${ids.length} member${ids.length == 1 ? '' : 's'}.'),
            backgroundColor: _primary,
          ),
        );
      }
    } catch (e) {
      print('Fast-forward error: $e');
      if (mounted) {
        setState(() => _ffBusy = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not update fast-forward. Please try again.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final n = _selectedMemberIds.length;
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _white,
        elevation: 0.5,
        foregroundColor: _textDark,
        title: Text(
          _pickingMembers ? 'Unlock Lesson' : '$n member${n == 1 ? '' : 's'} selected',
          style: TextStyle(color: _textDark, fontWeight: FontWeight.bold, fontSize: 18),
        ),
        leading: _pickingMembers
            ? null
            : IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => setState(() { _pickingMembers = true; _selected.clear(); }),
              ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : _pickingMembers
              ? _buildMemberList()
              : _buildUnlockView(),
      bottomNavigationBar: _loading
          ? null
          : _pickingMembers
              ? (_selectedMemberIds.isNotEmpty ? _continueBar() : null)
              : (_selected.isNotEmpty ? _unlockBar() : null),
    );
  }

  Widget _continueBar() => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: ElevatedButton(
            onPressed: () => setState(() => _pickingMembers = false),
            style: ElevatedButton.styleFrom(
              backgroundColor: _blue,
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: Text('Continue (${_selectedMemberIds.length})',
                style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
        ),
      );

  Widget _unlockBar() => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: ElevatedButton.icon(
            onPressed: _busy ? null : _unlockSelected,
            icon: _busy
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.lock_open),
            label: Text(_busy ? 'Unlocking…' : 'Unlock selected (${_selected.length})'),
            style: ElevatedButton.styleFrom(
              backgroundColor: _blue,
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),
      );

  Widget _buildMemberList() {
    if (_team.isEmpty) {
      return Center(
        child: Text('No team members found', style: TextStyle(fontSize: 16, color: _textLight)),
      );
    }
    final allIds = _allMemberIds();
    final allSelected = allIds.isNotEmpty && allIds.every(_selectedMemberIds.contains);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: Text('Select team members to unlock lessons or quizzes for them',
                  style: TextStyle(fontSize: 14, color: _textLight, fontWeight: FontWeight.w500)),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: _toggleSelectAllMembers,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: allSelected ? _blue.withOpacity(0.20) : _blue.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: _blue.withOpacity(0.4)),
                ),
                child: Text(allSelected ? 'Clear all' : 'Select all',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _blue)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        ..._team.map((member) {
          final name = (member['name'] ?? 'Unknown').toString();
          final id = (member['id'] ?? member['_id'] ?? '').toString();
          final checked = _selectedMemberIds.contains(id);
          return GestureDetector(
            onTap: () => _toggleMember(id),
            child: Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: _white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: checked ? _blue : const Color(0x00000000), width: checked ? 1.5 : 1),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: _primary.withOpacity(0.1),
                    child: Text(name.isNotEmpty ? name[0].toUpperCase() : 'U',
                        style: const TextStyle(color: _primary, fontWeight: FontWeight.bold, fontSize: 18)),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: _textDark)),
                        const SizedBox(height: 2),
                        Text((member['email'] ?? '').toString(), style: TextStyle(fontSize: 12, color: _textLight)),
                      ],
                    ),
                  ),
                  Checkbox(
                    value: checked,
                    activeColor: _blue,
                    onChanged: (_) => _toggleMember(id),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildUnlockView() {
    final q = _search.trim().toLowerCase();
    // Build the visible course blocks (filtered by search).
    final blocks = <Map<String, dynamic>>[];
    for (final course in _courses) {
      final cid = (course['id'] ?? '').toString();
      final all = (course['pages'] as List? ?? []).where((p) => p['status'] == 'published').toList();
      final courseMatches = q.isNotEmpty && (course['title'] ?? '').toString().toLowerCase().contains(q);
      final pages = q.isEmpty
          ? all
          : (courseMatches ? all : all.where((p) => (p['title'] ?? '').toString().toLowerCase().contains(q)).toList());
      if (pages.isNotEmpty) blocks.add({'course': course, 'cid': cid, 'pages': pages});
    }

    return Column(
      children: [
        // Fast-forward controls apply to every selected member at once.
        Container(
          color: _white,
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _ffBusy ? null : () => _setFastForward(true),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _blue,
                    side: BorderSide(color: _blue.withOpacity(0.4)),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text('⏩ Enable Fast-Forward',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: _ffBusy ? null : () => _setFastForward(false),
                style: OutlinedButton.styleFrom(
                  foregroundColor: _textLight,
                  side: BorderSide(color: AppColors.border),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('Disable', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
        // Search bar
        Container(
          color: _white,
          padding: const EdgeInsets.all(12),
          child: TextField(
            controller: _searchController,
            onChanged: (v) => setState(() => _search = v),
            decoration: InputDecoration(
              hintText: 'Search a lesson or quiz by name…',
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: _search.isNotEmpty
                  ? IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () {
                      setState(() { _search = ''; _searchController.clear(); });
                    })
                  : null,
              filled: true,
              fillColor: _bg,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
            ),
          ),
        ),
        Expanded(
          child: blocks.isEmpty
              ? Center(
                  child: Text(
                    q.isNotEmpty ? 'No lessons or quizzes match "$_search".' : 'No courses found.',
                    style: TextStyle(color: _textLight),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: blocks.length,
                  itemBuilder: (context, i) {
                    final course = blocks[i]['course'];
                    final cid = blocks[i]['cid'] as String;
                    final pages = blocks[i]['pages'] as List;
                    return _courseCard(course, cid, pages);
                  },
                ),
        ),
      ],
    );
  }

  Widget _courseCard(dynamic course, String cid, List pages) {
    final lessons = pages.where((p) => p["isQuiz"] != true).toList();
    final quizzes = pages.where((p) => p["isQuiz"] == true).toList();
    final lessonKeys = _pageKeys(cid, lessons);
    final quizKeys = _pageKeys(cid, quizzes);
    final allLessons = lessonKeys.isNotEmpty && lessonKeys.every(_selected.contains);
    final allQuizzes = quizKeys.isNotEmpty && quizKeys.every(_selected.contains);
    // A search always shows matches expanded; else honour the collapse toggle.
    final searching = _search.trim().isNotEmpty;
    final expanded = searching || !_collapsedCourses.contains(cid);
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surfaceAlt,
              borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Title + expand/collapse arrow (disabled while searching).
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: searching ? null : () => setState(() {
                    if (_collapsedCourses.contains(cid)) { _collapsedCourses.remove(cid); } else { _collapsedCourses.add(cid); }
                  }),
                  child: Row(
                    children: [
                      Icon(expanded ? Icons.keyboard_arrow_down : Icons.chevron_right, size: 20, color: _textLight),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text((course['title'] ?? 'Course').toString(),
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: _textDark)),
                      ),
                    ],
                  ),
                ),
                if (lessons.isNotEmpty || quizzes.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (lessons.isNotEmpty)
                        _chooseChip(allLessons ? 'Deselect Lessons' : 'Choose all Course Lessons', allLessons, () => _toggleSelectWholeCourse(cid, lessons)),
                      if (quizzes.isNotEmpty)
                        _chooseChip(allQuizzes ? 'Deselect Quizzes' : 'Choose all Course Quizzes', allQuizzes, () => _toggleSelectWholeCourse(cid, quizzes)),
                    ],
                  ),
                ],
              ],
            ),
          ),
          if (expanded) ...pages.map<Widget>((p) {
            final pid = (p['id'] ?? '').toString();
            final key = '$cid::$pid';
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: AppColors.border))),
              child: Row(
                children: [
                  SizedBox(
                    width: 34,
                    child: Checkbox(
                      value: _selected.contains(key),
                      activeColor: _blue,
                      onChanged: (_) => _toggleSelect(cid, pid),
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p['isQuiz'] == true ? 'Quiz' : 'Lesson',
                            style: TextStyle(fontSize: 10, color: _textLight)),
                        Text((p['title'] ?? '').toString(),
                            style: TextStyle(fontSize: 13, color: _textDark), maxLines: 2, overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
