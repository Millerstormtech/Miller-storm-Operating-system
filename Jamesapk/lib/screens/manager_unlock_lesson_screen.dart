import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_client.dart';

/// Managers unlock a specific lesson/quiz for a team member without the member
/// watching it. Unlock is stored separately from completed pages (never counts
/// toward progress %); the member is notified. Reached from the View Team page.
class ManagerUnlockLessonScreen extends StatefulWidget {
  const ManagerUnlockLessonScreen({super.key});

  @override
  State<ManagerUnlockLessonScreen> createState() => _ManagerUnlockLessonScreenState();
}

class _ManagerUnlockLessonScreenState extends State<ManagerUnlockLessonScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _blue = Color(0xFF2563EB);

  String _managerId = '';
  bool _loading = true;
  List<dynamic> _team = [];
  List<dynamic> _courses = [];

  dynamic _selectedMember;
  bool _loadingProgress = false;
  // courseId -> { 'completed': Set, 'unlocked': Set, 'quizResults': List }
  final Map<String, Map<String, dynamic>> _progress = {};
  // Selected page keys "courseId::pageId".
  final Set<String> _selected = {};
  bool _busy = false;
  String _search = '';
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
      await Future.wait([_fetchTeam(), _fetchCourses()]);
    } catch (e) {
      print('Unlock init error: $e');
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _fetchTeam() async {
    final url = Uri.parse('https://millerstorm.tech/api/users?role=sales&managerId=$_managerId');
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
    final url = Uri.parse('https://millerstorm.tech/api/courses?userId=$_managerId&userRole=manager&list=1');
    // Retry so a timed-out first attempt doesn't show a false "No courses found".
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        final res = await api.get(url).timeout(const Duration(seconds: 12));
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          _courses = data is List ? data : [];
          return;
        }
      } catch (e) {
        print('Unlock fetchCourses error (attempt ${attempt + 1}): $e');
      }
      if (attempt < 2) await Future.delayed(Duration(milliseconds: 600 * (attempt + 1)));
    }
  }

  Future<void> _selectMember(dynamic member) async {
    setState(() {
      _selectedMember = member;
      _loadingProgress = true;
      _progress.clear();
      _selected.clear();
      _search = '';
      _searchController.clear();
    });
    final mid = (member['id'] ?? member['_id'] ?? '').toString();
    await Future.wait(_courses.map((course) async {
      final cid = (course['id'] ?? '').toString();
      try {
        final res = await api.get(Uri.parse(
                'https://millerstorm.tech/api/manager/unlock-lesson?memberUserId=$mid&courseId=$cid'))
            .timeout(const Duration(seconds: 20));
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          _progress[cid] = {
            'completed': (data['completedPages'] as List? ?? []).map((e) => e.toString()).toSet(),
            'unlocked': (data['unlockedPages'] as List? ?? []).map((e) => e.toString()).toSet(),
            'quizResults': data['quizResults'] as List? ?? [],
          };
        } else {
          _progress[cid] = {'completed': <String>{}, 'unlocked': <String>{}, 'quizResults': []};
        }
      } catch (_) {
        _progress[cid] = {'completed': <String>{}, 'unlocked': <String>{}, 'quizResults': []};
      }
    }));
    if (mounted) setState(() => _loadingProgress = false);
  }

  bool _isCompleted(String courseId, dynamic page) {
    final prog = _progress[courseId];
    if (prog == null) return false;
    final id = (page['id'] ?? '').toString();
    if (page['isQuiz'] == true) {
      final results = prog['quizResults'] as List;
      final match = results.where((r) => r['pageId']?.toString() == id);
      if (match.isEmpty) return false;
      final score = match.first['score'];
      final total = (score?['total'] ?? 0) as num;
      if (total <= 0) return false;
      return (score?['correct'] ?? 0) / total >= 0.6;
    }
    return (prog['completed'] as Set).contains(id);
  }

  bool _isUnlocked(String courseId, String pageId) =>
      (_progress[courseId]?['unlocked'] as Set?)?.contains(pageId) ?? false;

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

  // Keys of every unlockable (not-yet-completed) page in a course. Completed
  // pages are skipped since they can't be unlocked.
  List<String> _unlockableKeys(String courseId, List pages) => pages
      .where((p) => !_isCompleted(courseId, p))
      .map((p) => '$courseId::${(p['id'] ?? '').toString()}')
      .toList();

  // Select (or clear) the whole course at once, so a manager can unlock every
  // lesson/quiz in one go via the existing "Unlock selected" button.
  void _toggleSelectWholeCourse(String courseId, List pages) {
    final keys = _unlockableKeys(courseId, pages);
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
    if (_selected.isEmpty || _selectedMember == null) return;
    setState(() => _busy = true);
    final mid = (_selectedMember['id'] ?? _selectedMember['_id'] ?? '').toString();
    // Group selected page ids by course.
    final byCourse = <String, List<String>>{};
    for (final key in _selected) {
      final parts = key.split('::');
      byCourse.putIfAbsent(parts[0], () => []).add(parts[1]);
    }
    try {
      for (final entry in byCourse.entries) {
        final course = _courses.firstWhere((c) => (c['id'] ?? '').toString() == entry.key, orElse: () => null);
        final res = await api.post(
          Uri.parse('https://millerstorm.tech/api/manager/unlock-lesson'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'memberUserId': mid,
            'courseId': entry.key,
            'pageIds': entry.value,
            'action': 'unlock',
            'courseName': course?['title'] ?? '',
          }),
        ).timeout(const Duration(seconds: 25));
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          _progress[entry.key]?['unlocked'] =
              (data['unlockedPages'] as List? ?? []).map((e) => e.toString()).toSet();
        }
      }
      if (mounted) {
        setState(() { _selected.clear(); _busy = false; });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unlocked — the team member has been notified.'), backgroundColor: _primary),
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

  Future<void> _toggleOne(String courseId, String pageId, bool unlock) async {
    final mid = (_selectedMember['id'] ?? _selectedMember['_id'] ?? '').toString();
    final course = _courses.firstWhere((c) => (c['id'] ?? '').toString() == courseId, orElse: () => null);
    try {
      final res = await api.post(
        Uri.parse('https://millerstorm.tech/api/manager/unlock-lesson'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'memberUserId': mid,
          'courseId': courseId,
          'pageId': pageId,
          'action': unlock ? 'unlock' : 'lock',
          'courseName': course?['title'] ?? '',
        }),
      ).timeout(const Duration(seconds: 25));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        setState(() {
          _progress[courseId]?['unlocked'] =
              (data['unlockedPages'] as List? ?? []).map((e) => e.toString()).toSet();
        });
        if (unlock && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Unlocked — the team member has been notified.'), backgroundColor: _primary),
          );
        }
      }
    } catch (e) {
      print('Toggle unlock error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _white,
        elevation: 0.5,
        foregroundColor: _textDark,
        title: Text(
          _selectedMember == null ? 'Unlock Lesson' : (_selectedMember['name'] ?? 'Member').toString(),
          style: const TextStyle(color: _textDark, fontWeight: FontWeight.bold, fontSize: 18),
        ),
        leading: _selectedMember == null
            ? null
            : IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => setState(() { _selectedMember = null; _selected.clear(); }),
              ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : _selectedMember == null
              ? _buildMemberList()
              : _buildUnlockView(),
      bottomNavigationBar: (_selectedMember != null && _selected.isNotEmpty)
          ? SafeArea(
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
            )
          : null,
    );
  }

  Widget _buildMemberList() {
    if (_team.isEmpty) {
      return Center(
        child: Text('No team members found', style: TextStyle(fontSize: 16, color: _textLight)),
      );
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Select a team member to unlock lessons or quizzes for them',
            style: TextStyle(fontSize: 14, color: _textLight, fontWeight: FontWeight.w500)),
        const SizedBox(height: 12),
        ..._team.map((member) {
          final name = (member['name'] ?? 'Unknown').toString();
          return GestureDetector(
            onTap: () => _selectMember(member),
            child: Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: _white,
                borderRadius: BorderRadius.circular(12),
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
                        Text(name, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: _textDark)),
                        const SizedBox(height: 2),
                        Text((member['email'] ?? '').toString(), style: TextStyle(fontSize: 12, color: _textLight)),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: Color(0xFFBDBDBD)),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildUnlockView() {
    if (_loadingProgress) {
      return const Center(child: CircularProgressIndicator(color: _primary));
    }
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
    final unlockableKeys = _unlockableKeys(cid, pages);
    final allSelected = unlockableKeys.isNotEmpty && unlockableKeys.every(_selected.contains);
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: const BoxDecoration(
              color: Color(0xFFF8FAFC),
              borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text((course['title'] ?? 'Course').toString(),
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: _textDark)),
                ),
                if (unlockableKeys.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () => _toggleSelectWholeCourse(cid, pages),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: allSelected ? const Color(0xFFE0E7FF) : const Color(0xFFEFF6FF),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFBFDBFE)),
                      ),
                      child: Text(
                        allSelected ? 'Deselect all' : '🔓 Unlock whole course',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _blue),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          ...pages.map<Widget>((p) {
            final pid = (p['id'] ?? '').toString();
            final done = _isCompleted(cid, p);
            final unlocked = _isUnlocked(cid, pid);
            final key = '$cid::$pid';
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: const BoxDecoration(border: Border(top: BorderSide(color: Color(0xFFF1F5F9)))),
              child: Row(
                children: [
                  if (!done)
                    SizedBox(
                      width: 34,
                      child: Checkbox(
                        value: _selected.contains(key),
                        activeColor: _blue,
                        onChanged: (_) => _toggleSelect(cid, pid),
                      ),
                    )
                  else
                    const SizedBox(width: 34),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p['isQuiz'] == true ? 'Quiz' : 'Lesson',
                            style: TextStyle(fontSize: 10, color: _textLight)),
                        Text((p['title'] ?? '').toString(),
                            style: const TextStyle(fontSize: 13, color: _textDark), maxLines: 2, overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (done)
                    _statusChip('✓ Completed', const Color(0xFFD1FAE5), const Color(0xFF065F46))
                  else if (unlocked)
                    GestureDetector(
                      onTap: () => _toggleOne(cid, pid, false),
                      child: _statusChip('🔓 Unlocked ✕', const Color(0xFFFEF3C7), const Color(0xFF92400E)),
                    )
                  else
                    _statusChip('🔒 Locked', const Color(0xFFF3F4F6), _textLight),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _statusChip(String text, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg)),
    );
  }
}
