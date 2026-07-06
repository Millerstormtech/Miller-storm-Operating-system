import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/auth_service.dart';
import 'course_detail_screen.dart';
import 'training_leaderboard_screen.dart';

class CoursesScreen extends StatefulWidget {
  const CoursesScreen({super.key});

  @override
  State<CoursesScreen> createState() => _CoursesScreenState();
}

class _CoursesScreenState extends State<CoursesScreen> with SingleTickerProviderStateMixin {
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
  bool _isLoading = true;
  bool _hasCachedData = false;
  // True when the last course fetch failed (network/API) — lets the UI show a
  // "couldn't load, retry" state instead of a misleading "No courses available".
  bool _loadError = false;
  late TabController _tabController;
  String? _userId;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  static const String _cacheKey = 'courses_cache';
  static const String _cacheTimeKey = 'courses_cache_time';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
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
    ]);
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
                  : courses.where((c) {
                      final t = (c['title'] ?? '').toLowerCase();
                      final d = (c['description'] ?? '').toLowerCase();
                      return t.contains(_searchQuery) || d.contains(_searchQuery);
                    }).toList();
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
        _filteredCourses = _courses.where((course) {
          final title = (course['title'] ?? '').toLowerCase();
          final description = (course['description'] ?? '').toLowerCase();
          return title.contains(_searchQuery) || description.contains(_searchQuery);
        }).toList();
      }
    });
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
        setState(() {
          _assignedPlaylists = jsonDecode(response.body);
        });
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
          'Miller Storm Training Center',
          style: TextStyle(color: _textDark, fontSize: 18, fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            icon: const Text('🏆', style: TextStyle(fontSize: 26)),
            onPressed: () {
              Navigator.pushNamed(context, '/training-leaderboard');
            },
          ),
          const SizedBox(width: 8),
        ],
        bottom: TabBar(
          controller: _tabController,
          labelColor: _blue,
          unselectedLabelColor: _textLight,
          indicatorColor: _blue,
          labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          tabs: const [
            Tab(text: 'Courses'),
            Tab(text: 'My Playlists'),
            Tab(text: 'Assigned'),
          ],
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

  Widget _buildCoursesTab() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: _primary));
    }
    return Column(
      children: [
        Container(
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
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _filteredCourses.length,
                    itemBuilder: (context, index) {
                      final course = _filteredCourses[index];
                      return Padding(
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
                'Your manager hasn\'t assigned any playlists yet',
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

  Widget _buildCourseCard(String title, String progress, IconData icon, String? coverImageUrl) {
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
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: _textDark,
              ),
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
              _navItemActive(Icons.school, 'Training'),
              const SizedBox(width: 2),
              _navItem(Icons.chat_bubble, 'StormChat', '/stormchat'),
              const SizedBox(width: 2),
              _navItem(Icons.apps, 'Apps & Tools', '/apps-tools-items'),
              const SizedBox(width: 2),
              _navItem(Icons.person, 'Profile', '/profile'),
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
              Text(label, style: const TextStyle(fontSize: 11, color: _textLight)),
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
            Text(label, style: const TextStyle(fontSize: 11, color: _primary, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
