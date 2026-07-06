import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import '../services/auth_service.dart';
import 'lesson_player_screen.dart';

class CourseDetailScreen extends StatefulWidget {
  final String courseId;
  final String courseTitle;
  final List<String>? playlistModules;
  // When set (e.g. from a "new lesson/quiz" notification tap), auto-open this
  // page's player once the course has loaded.
  final String? initialPageId;

  const CourseDetailScreen({
    super.key,
    required this.courseId,
    required this.courseTitle,
    this.playlistModules,
    this.initialPageId,
  });

  @override
  State<CourseDetailScreen> createState() => _CourseDetailScreenState();
}

class _CourseDetailScreenState extends State<CourseDetailScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textMedium = Color(0xFF374151);
  static const _textLight = Color(0xFF6B7280);
  static const _border = Color(0xFFD1D5DB);

  Map<String, dynamic>? _course;
  bool _isLoading = true;
  int _completedLessons = 0;
  int _totalLessons = 0;
  int _progressPercent = 0;
  String? _userId;
  Set<String> _completedPageIds = <String>{};
  // Pages a manager manually unlocked for this user (accessible without watching,
  // but NOT counted as completed). Read from the progress API.
  Set<String> _unlockedPageIds = <String>{};
  List<dynamic> _quizResults = <dynamic>[];
  
  // Track which sections are expanded
  Set<int> _expandedSections = <int>{};
  
  // Playlist creation
  bool _isCreatingPlaylist = false;
  String _playlistName = '';
  Set<String> _selectedModules = <String>{};

  @override
  void initState() {
    super.initState();
    _loadUserId();
    _fetchCourseDetail();
  }

  // Guard so the notification-driven page only auto-opens once, even though
  // _fetchCourseDetail may run again (e.g. after returning from the player).
  bool _autoOpenedLesson = false;

  // When opened from a "new lesson/quiz" notification, jump straight into that
  // page's player once the course has loaded.
  void _maybeAutoOpenLesson() {
    if (_autoOpenedLesson) return;
    final targetId = widget.initialPageId;
    if (targetId == null || targetId.isEmpty || _course == null) return;

    final pages = (_course!['pages'] as List<dynamic>? ?? []);
    final matches = pages.where((p) => p['id']?.toString() == targetId);
    if (matches.isEmpty) return;
    final page = matches.first;

    _autoOpenedLesson = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final result = await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => LessonPlayerScreen(
            courseId: widget.courseId,
            courseTitle: widget.courseTitle,
            lessonId: targetId,
            lessonTitle: page['title']?.toString() ?? 'Lesson',
            playlistModules: widget.playlistModules,
          ),
        ),
      );
      if (result == true || mounted) _fetchCourseDetail();
    });
  }

  Future<void> _loadUserId() async {
    final user = await AuthService.getStoredUser();
    setState(() {
      _userId = user?['id'] ?? user?['_id'] ?? '';
    });
  }

  Future<void> _fetchCourseDetail() async {
    try {
      final user = await AuthService.getStoredUser();
      final userId = user?['id'] ?? '';
      
      print('🔵 Fetching course detail: ${widget.courseId}');
      
      // list=1 → light payload (lesson titles/status/videoUrl only; the lesson
      // player fetches full content per lesson). The response now also carries
      // completed/unlocked/quiz progress, so this is a SINGLE fast round-trip
      // instead of a heavy course fetch + a second /api/progress call.
      final response = await api
          .get(Uri.parse('https://millerstorm.tech/api/courses/${widget.courseId}?userId=$userId&list=1'))
          .timeout(const Duration(seconds: 20));

      print('🔵 Course detail response: ${response.statusCode}');

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);

        // Progress arrays come from the same response now.
        final completedIds =
            (data['completedPages'] as List<dynamic>? ?? []).map((p) => p.toString()).toSet();
        final unlockedIds =
            (data['unlockedPages'] as List<dynamic>? ?? []).map((p) => p.toString()).toSet();
        final quizResults = data['quizResults'] as List<dynamic>? ?? [];

        setState(() {
          _course = data;
          _completedLessons = data['progress']?['completedLessons'] ?? completedIds.length;
          _totalLessons = data['progress']?['totalLessons'] ?? 0;
          _progressPercent = data['progress']?['progressPercent'] ?? 0;
          _completedPageIds = completedIds;
          _unlockedPageIds = unlockedIds;
          _quizResults = quizResults;
          _isLoading = false;
        });
        print('✅ Course loaded: ${data['title']}');
        print('📊 Progress: $_completedLessons/$_totalLessons ($_progressPercent%)');
        print('✅ Completed IDs: $_completedPageIds');
        _maybeAutoOpenLesson();
      } else {
        setState(() {
          _isLoading = false;
        });
      }
    } catch (e) {
      print('❌ Error fetching course detail: $e');
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _textDark),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          widget.courseTitle,
          style: const TextStyle(color: _textDark, fontSize: 18, fontWeight: FontWeight.w700),
        ),
        actions: widget.playlistModules == null ? [
          IconButton(
            icon: const Icon(Icons.playlist_add, color: _textDark),
            onPressed: () => _showCreatePlaylistDialog(),
            tooltip: 'Make Playlist',
          ),
        ] : null,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (widget.playlistModules == null) _buildProgressSection(),
                  if (widget.playlistModules == null) const SizedBox(height: 24),
                  if (widget.playlistModules == null) _buildContinueButton(),
                  if (widget.playlistModules == null) const SizedBox(height: 32),
                  if (widget.playlistModules != null) const SizedBox(height: 16),
                  _buildCourseContent(),
                ],
              ),
            ),
    );
  }

  Widget _buildTimerSection() {
    return Container(
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
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: _primary.withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.timer_outlined, color: _primary, size: 20),
              ),
              const SizedBox(width: 12),
              const Text(
                'Training Timer',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _textDark),
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: _primary,
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Text(
              'Start Timer',
              style: TextStyle(color: _white, fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProgressSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Course Progress',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _textMedium),
        ),
        const SizedBox(height: 8),
        Text(
          'Completed $_completedLessons of $_totalLessons items',
          style: const TextStyle(fontSize: 14, color: _textLight),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: _totalLessons > 0 ? _completedLessons / _totalLessons : 0,
                  minHeight: 8,
                  backgroundColor: _border,
                  valueColor: AlwaysStoppedAnimation<Color>(_primary),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Text(
              '$_progressPercent%',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: _textDark),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildContinueButton() {
    return GestureDetector(
      onTap: () async {
        if (_course != null) {
          final pages = _course!['pages'] as List<dynamic>? ?? [];
          final folders = _course!['folders'] as List<dynamic>? ?? [];

          var lessons = pages.where((page) => page['status'] == 'published').toList();
          // Folder-grouped order (same as web): non-folder pages first, then
          // each folder's pages in order. Prevents skipping/jumping modules.
          lessons = orderPagesByFolder(lessons, folders);

          // Fetch actual completed pages from progress API
          Set<String> completedLessonIds = {};
          List<dynamic> quizResults = <dynamic>[];
          try {
            final user = await AuthService.getStoredUser();
            final userId = user?['id'] ?? '';
            if (userId.isNotEmpty) {
              final progressResponse = await api.get(
                Uri.parse('https://millerstorm.tech/api/progress?userId=$userId&courseId=${widget.courseId}'),
              );
              if (progressResponse.statusCode == 200) {
                final progressData = jsonDecode(progressResponse.body);
                final completedPages = progressData['completedPages'] as List<dynamic>? ?? [];
                completedLessonIds = completedPages.map((p) => p.toString()).toSet();
                quizResults = progressData['quizResults'] as List<dynamic>? ?? [];
                print('✅ Completed pages: $completedLessonIds');
              }
            }
          } catch (e) {
            print('⚠️ Could not load progress: $e');
          }

          // Find first incomplete item (lesson not watched, or quiz not passed).
          bool isItemComplete(dynamic item) {
            if (item['isQuiz'] == true) {
              final m = quizResults.where((r) => r['pageId']?.toString() == item['id']?.toString());
              if (m.isEmpty) return false;
              final score = m.first['score'];
              final total = (score?['total'] ?? 0) as num;
              if (total <= 0) return false;
              return ((score?['correct'] ?? 0) as num) / total >= 0.6;
            }
            return completedLessonIds.contains(item['id']?.toString());
          }
          dynamic nextLesson;
          for (final lesson in lessons) {
            if (!isItemComplete(lesson)) {
              nextLesson = lesson;
              break;
            }
          }
          // If all completed, go to first lesson
          nextLesson ??= lessons.isNotEmpty ? lessons.first : null;

          if (nextLesson != null) {
            final result = await Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => LessonPlayerScreen(
                  courseId: widget.courseId,
                  courseTitle: widget.courseTitle,
                  lessonId: nextLesson['id'] ?? '',
                  lessonTitle: nextLesson['title'] ?? 'Lesson',
                  playlistModules: widget.playlistModules,
                ),
              ),
            );
            
            // Refresh progress when returning from player
            if (result == true || mounted) {
              _fetchCourseDetail();
            }
          }
        }
      },
      child: Container(
        width: double.infinity,
        height: 50,
        decoration: BoxDecoration(
          color: _textDark,
          borderRadius: BorderRadius.circular(25),
        ),
        child: const Center(
          child: Text(
            'Resume Training',
            style: TextStyle(color: _white, fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
      ),
    );
  }

  // A quiz counts as complete only if a saved result scored >= 60% (same
  // threshold as the web). Quizzes are tracked in quizResults, not completedPages.
  bool _isQuizPassed(String pageId) {
    final matches = _quizResults.where((r) => r['pageId']?.toString() == pageId);
    if (matches.isEmpty) return false;
    final score = matches.first['score'];
    final total = (score?['total'] ?? 0) as num;
    if (total <= 0) return false;
    final correct = (score?['correct'] ?? 0) as num;
    return correct / total >= 0.6;
  }

  Widget _buildCourseContent() {
    if (_course == null) {
      return const SizedBox();
    }

    // Get folders from course data
    final folders = _course!['folders'] as List<dynamic>? ?? [];
    var allPublishedPages = (_course!['pages'] as List<dynamic>? ?? [])
        .where((page) => page['status'] == 'published')
        .toList();
    
    // Folder-grouped order (same as web): non-folder pages first, then each
    // folder's pages in order. Used for unlock + sequencing.
    allPublishedPages = orderPagesByFolder(allPublishedPages, folders);

    // Filter pages if viewing a playlist
    var pagesToShow = allPublishedPages;
    if (widget.playlistModules != null) {
      pagesToShow = allPublishedPages.where((page) => widget.playlistModules!.contains(page['id'])).toList();
    }
    
    // Strict sequential unlock (same as web): a page is unlocked ONLY IF EVERY
    // preceding item is complete — lesson watched, or quiz passed (>= 60%). The
    // first incomplete item locks everything after it, so a newly-inserted
    // lesson/quiz re-locks the rest until it's done.
    bool isPageUnlocked(String pageId) {
      // A manager can manually unlock this specific page for the user — it then
      // opens without needing the preceding items done (only THIS page, nothing
      // after it, is unlocked).
      if (_unlockedPageIds.contains(pageId)) return true;
      final index = allPublishedPages.indexWhere((p) => p['id'] == pageId);
      if (index <= 0) return true; // First page is always unlocked
      for (var i = 0; i < index; i++) {
        final p = allPublishedPages[i];
        if (p['isQuiz'] == true) {
          if (!_isQuizPassed(p['id'].toString())) return false;
        } else if (!_completedPageIds.contains(p['id'].toString())) {
          return false;
        }
      }
      return true;
    }

    // If no folders, create sections from lessonNames or pages
    List<Map<String, dynamic>> sections = [];
    
    if (folders.isNotEmpty) {
      // Non-folder pages first (matches the folder-grouped navigation order),
      // then each folder as a section.
      final noFolderPages = pagesToShow.where((page) => page['folderId'] == null).toList();
      if (noFolderPages.isNotEmpty) {
        sections.add({
          'title': 'Course Content',
          'lessons': noFolderPages.length,
          'pages': noFolderPages,
        });
      }
      sections.addAll(folders.map<Map<String, dynamic>>((folder) {
        final folderPages = pagesToShow.where((page) => page['folderId'] == folder['id']).toList();
        return {
          'title': folder['title'] ?? 'Untitled Section',
          'lessons': folderPages.length,
          'pages': folderPages,
        };
      }).where((section) => section['lessons'] > 0));
    } else if (pagesToShow.isNotEmpty) {
      // Group pages by some logic or show all as one section
      sections = [
        {
          'title': 'Course Content',
          'lessons': pagesToShow.length,
          'pages': pagesToShow,
        }
      ];
    } else {
      // Fallback to mock sections if no structured data
      sections = [
        {'title': 'Course Materials', 'lessons': _totalLessons, 'pages': []},
      ];
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Course Content',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _textDark),
        ),
        const SizedBox(height: 8),
        Text(
          '${sections.length} Sections • $_totalLessons Items',
          style: const TextStyle(fontSize: 14, color: _textLight),
        ),
        const SizedBox(height: 16),
        Container(
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
            children: sections.asMap().entries.map((entry) {
              final index = entry.key;
              final section = entry.value;
              final isExpanded = _expandedSections.contains(index);
              final sectionPages = section['pages'] as List<dynamic>? ?? [];
              
              return Column(
                children: [
                  // Section Header (Clickable)
                  InkWell(
                    onTap: () {
                      setState(() {
                        if (isExpanded) {
                          _expandedSections.remove(index);
                        } else {
                          _expandedSections.add(index);
                        }
                      });
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
                      child: Row(
                        children: [
                          AnimatedRotation(
                            turns: isExpanded ? 0.25 : 0,
                            duration: const Duration(milliseconds: 200),
                            child: Icon(
                              Icons.chevron_right,
                              color: _textMedium,
                              size: 20,
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  section['title'] as String,
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                    color: _textDark,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                if (section['lessons'] > 0)
                                  Text(
                                    '${section['lessons']} lessons',
                                    style: const TextStyle(
                                      fontSize: 13,
                                      color: _textLight,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: _bg,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              '${section['lessons']}',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: _textMedium,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  
                  // Expandable Content with Animation
                  AnimatedCrossFade(
                    duration: const Duration(milliseconds: 300),
                    crossFadeState: isExpanded && sectionPages.isNotEmpty 
                        ? CrossFadeState.showSecond 
                        : CrossFadeState.showFirst,
                    firstChild: const SizedBox.shrink(),
                    secondChild: Container(
                      width: double.infinity,
                      color: const Color(0xFFFAFAFA),
                      padding: const EdgeInsets.only(top: 12, bottom: 20),
                      child: Column(
                        children: sectionPages.asMap().entries.map<Widget>((pageEntry) {
                          final pageIndex = pageEntry.key;
                          final page = pageEntry.value;
                          final pageId = page['id'].toString();
                          final isCompleted = _completedPageIds.contains(pageId);
                          final isUnlocked = isPageUnlocked(pageId);
                          
                          return GestureDetector(
                            onTap: () async {
                              if (!isUnlocked) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Please complete the previous lesson first'),
                                    backgroundColor: Colors.orange,
                                  ),
                                );
                                return;
                              }

                              // Navigate to lesson player
                              final result = await Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (context) => LessonPlayerScreen(
                                    courseId: widget.courseId,
                                    courseTitle: widget.courseTitle,
                                    lessonId: pageId,
                                    lessonTitle: page['title'] ?? 'Lesson ${pageIndex + 1}',
                                    playlistModules: widget.playlistModules,
                                  ),
                                ),
                              );

                              // Refresh progress when returning from player
                              if (result == true || mounted) {
                                _fetchCourseDetail();
                              }
                            },
                            child: Opacity(
                              opacity: isUnlocked ? 1.0 : 0.5,
                              child: Container(
                                margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: _white,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(color: _border.withOpacity(0.3)),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withOpacity(0.02),
                                      blurRadius: 4,
                                      offset: const Offset(0, 1),
                                    ),
                                  ],
                                ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 32,
                                    height: 32,
                                    decoration: const BoxDecoration(
                                      color: _bg,
                                      shape: BoxShape.circle,
                                    ),
                                    child: Icon(
                                      !isUnlocked
                                          ? Icons.lock_outline
                                          : page['isQuiz'] == true 
                                              ? Icons.quiz_outlined
                                              : Icons.play_arrow,
                                      size: 16,
                                      color: _textLight,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          page['title'] ?? 'Lesson ${pageIndex + 1}',
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w500,
                                            color: _textDark,
                                          ),
                                        ),
                                        // Only show "Video lesson" if page has videoUrl and is not a quiz
                                        if (page['isQuiz'] != true && page['videoUrl'] != null && page['videoUrl'].toString().isNotEmpty)
                                          const SizedBox(height: 2),
                                        if (page['isQuiz'] != true && page['videoUrl'] != null && page['videoUrl'].toString().isNotEmpty)
                                          Row(
                                            children: [
                                              Icon(
                                                Icons.videocam_outlined,
                                                size: 12,
                                                color: _textLight,
                                              ),
                                              const SizedBox(width: 4),
                                              Text(
                                                'Video lesson',
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  color: _textLight,
                                                ),
                                              ),
                                            ],
                                          ),
                                      ],
                                    ),
                                  ),
                                  if (page['isQuiz'] == true)
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: Colors.orange.withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        'Quiz',
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w600,
                                          color: Colors.orange.shade700,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ),
                  
                  // Divider (except for last item)
                  if (index < sections.length - 1)
                    Divider(height: 1, color: _border, indent: 16, endIndent: 16),
                ],
              );
            }).toList(),
          ),
        ),
      ],
    );
  }

  void _showCreatePlaylistDialog() {
    setState(() {
      _playlistName = '';
      _selectedModules.clear();
    });

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: _white,
          title: const Text('Create Playlist', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          content: SingleChildScrollView(
            child: SizedBox(
              width: MediaQuery.of(context).size.width * 0.9,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    decoration: const InputDecoration(
                      labelText: 'Playlist Name',
                      border: OutlineInputBorder(),
                      hintText: 'Enter playlist name',
                    ),
                    onChanged: (value) {
                      setDialogState(() => _playlistName = value);
                    },
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Select Lessons & Quizzes',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    constraints: const BoxConstraints(maxHeight: 400),
                    decoration: BoxDecoration(
                      border: Border.all(color: _border),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: ListView(
                      shrinkWrap: true,
                      children: _buildModuleCheckboxes(setDialogState),
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: _playlistName.trim().isEmpty || _selectedModules.isEmpty
                  ? null
                  : () async {
                      Navigator.of(dialogContext).pop();
                      await _createPlaylist();
                    },
              style: ElevatedButton.styleFrom(
                backgroundColor: _primary,
                foregroundColor: _white,
                disabledBackgroundColor: _border,
              ),
              child: const Text('Create Playlist'),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildModuleCheckboxes(StateSetter setDialogState) {
    if (_course == null) return [];

    final pages = _course!['pages'] as List<dynamic>? ?? [];
    final folders = _course!['folders'] as List<dynamic>? ?? [];

    List<Widget> widgets = [];

    // Pages without folders
    for (var page in pages.where((p) => p['folderId'] == null)) {
      widgets.add(
        CheckboxListTile(
          title: Text(page['title'] ?? 'Untitled'),
          value: _selectedModules.contains(page['id']),
          onChanged: (bool? value) {
            setDialogState(() {
              if (value == true) {
                _selectedModules.add(page['id']);
              } else {
                _selectedModules.remove(page['id']);
              }
            });
            setState(() {});
          },
        ),
      );
    }

    // Folders with their pages
    for (var folder in folders) {
      final folderPages = pages.where((p) => p['folderId'] == folder['id']).toList();
      if (folderPages.isEmpty) continue;

      widgets.add(
        Container(
          color: _bg,
          child: ListTile(
            title: Text(
              '📁 ${folder['title']}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            dense: true,
          ),
        ),
      );

      for (var page in folderPages) {
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(left: 16),
            child: CheckboxListTile(
              title: Text(
                '${page['isQuiz'] == true ? '📝' : '📄'} ${page['title'] ?? 'Untitled'}',
                style: const TextStyle(fontSize: 14),
              ),
              value: _selectedModules.contains(page['id']),
              onChanged: (bool? value) {
                setDialogState(() {
                  if (value == true) {
                    _selectedModules.add(page['id']);
                  } else {
                    _selectedModules.remove(page['id']);
                  }
                });
                setState(() {});
              },
            ),
          ),
        );
      }
    }

    return widgets;
  }

  Future<void> _createPlaylist() async {
    if (_userId == null || _userId!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('User not logged in')),
      );
      return;
    }

    try {
      final user = await AuthService.getStoredUser();
      final response = await api.post(
        Uri.parse('https://millerstorm.tech/api/playlists'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'name': _playlistName,
          'courseId': widget.courseId,
          'courseName': widget.courseTitle,
          'selectedModules': _selectedModules.toList(),
          'managerId': _userId,
          'managerName': user?['name'] ?? 'User',
        }),
      );

      if (response.statusCode == 201) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Playlist created successfully!'),
            backgroundColor: Colors.green,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to create playlist')),
        );
      }
    } catch (e) {
      print('Error creating playlist: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error creating playlist')),
      );
    }
  }
}
