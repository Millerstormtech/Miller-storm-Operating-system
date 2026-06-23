import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import '../services/auth_service.dart';

class ManagerTrainingLeaderboardScreen extends StatefulWidget {
  const ManagerTrainingLeaderboardScreen({super.key});

  @override
  State<ManagerTrainingLeaderboardScreen> createState() => _ManagerTrainingLeaderboardScreenState();
}

class _ManagerTrainingLeaderboardScreenState extends State<ManagerTrainingLeaderboardScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textMedium = Color(0xFF374151);
  static const _textLight = Color(0xFF6B7280);
  static const _border = Color(0xFFD1D5DB);
  static const _gold = Color(0xFFFFD700);
  static const _silver = Color(0xFFC0C0C0);
  static const _bronze = Color(0xFFCD7F32);

  List<dynamic> _courses = [];
  List<dynamic> _playlists = [];
  dynamic _selectedCourse;
  dynamic _selectedPlaylist;
  String _viewType = 'courses'; // 'courses' or 'playlists'
  List<Map<String, dynamic>> _leaderboardRows = [];
  bool _isLoadingCourses = true;
  bool _isLoadingLeaderboard = false;
  String? _currentUserId;
  String? _managerId;
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();
  
  // New state for Team vs Company toggle
  bool _showTeamOnly = true;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final user = await AuthService.getStoredUser();
    setState(() {
      _currentUserId = user?['id'] ?? user?['_id'] ?? '';
      _managerId = _currentUserId; // Managers see their own team
    });
    await Future.wait([
      _fetchCourses(),
      _fetchPlaylists(),
    ]);
  }

  Future<void> _fetchPlaylists() async {
    if (_managerId == null) return;
    try {
      final response = await api.get(Uri.parse('https://millerstorm.tech/api/playlists?managerId=$_managerId'));
      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        setState(() {
          _playlists = data;
          if (_viewType == 'playlists' && data.isNotEmpty) {
            _selectedPlaylist = data[0];
          }
        });
      }
    } catch (e) {
      print('Error fetching playlists: $e');
    }
  }

  Future<void> _fetchCourses() async {
    try {
      final response = await api.get(Uri.parse('https://millerstorm.tech/api/courses'));
      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        final published = data.where((c) => c['status'] == 'published').toList();
        
        setState(() {
          _courses = published;
          if (published.isNotEmpty) {
            _selectedCourse = published[0];
          }
          _isLoadingCourses = false;
        });

        if (_viewType == 'courses' && _selectedCourse != null) {
          _fetchLeaderboard(course: _selectedCourse);
        }
      }
    } catch (e) {
      print('Error fetching courses: $e');
      setState(() => _isLoadingCourses = false);
    }
  }

  Future<void> _fetchLeaderboard({dynamic course, dynamic playlist}) async {
    setState(() {
      _isLoadingLeaderboard = true;
      _leaderboardRows = [];
    });

    try {
      // If playlist mode, use the old approach for now (we can optimize playlists later)
      if (_viewType == 'playlists' && playlist != null) {
        // Original playlist logic here
        final usersResponse = await api.get(Uri.parse('https://millerstorm.tech/api/users'));
        if (usersResponse.statusCode != 200) throw Exception('Failed to fetch users');
        
        final List<dynamic> allUsers = jsonDecode(usersResponse.body);
        
        Set<String>? assignedUserIds;
        try {
          final playlistId = playlist['_id'] ?? playlist['id'];
          final assignRes = await api.get(Uri.parse('https://millerstorm.tech/api/playlist-assignments?playlistId=$playlistId'));
          if (assignRes.statusCode == 200) {
            final List<dynamic> assignments = jsonDecode(assignRes.body);
            assignedUserIds = Set.from(assignments.map((a) => a['assignedToUserId'].toString()));
          }
        } catch (e) {
          print('Error fetching playlist assignments: $e');
        }

        final targetUsers = allUsers.where((u) {
          final userId = (u['id'] ?? u['_id']).toString();
          final isDeleted = u['deleted'] == true;
          final isSuspended = u['suspended'] == true;
          if (isDeleted || isSuspended) return false;

          final roles = u['roles'] as List<dynamic>? ?? [];
          final hasTargetRole = u['role'] == 'manager' || u['role'] == 'sales' || 
                               roles.contains('manager') || roles.contains('sales');
          if (!hasTargetRole) return false;

          return assignedUserIds?.contains(userId) ?? false;
        }).toList();

        final targetCourseId = playlist['courseId'];
        final selectedModules = playlist['selectedModules'] as List<dynamic>? ?? [];
        final targetModuleIds = Set.from(selectedModules);
        final totalModules = targetModuleIds.length;

        final List<Map<String, dynamic>> builtRows = [];
        final List<Future<void>> progressFutures = targetUsers.map((u) async {
          try {
            final userId = u['id'] ?? u['_id'];
            final progRes = await api.get(
              Uri.parse('https://millerstorm.tech/api/course-progress?userId=$userId&courseIds=$targetCourseId')
            );
            
            if (progRes.statusCode == 200) {
              final progData = jsonDecode(progRes.body);
              final rec = progData[targetCourseId] ?? {};
              final completedPages = (rec['completedPages'] as List<dynamic>? ?? []);
              final doneCount = completedPages.where((id) => targetModuleIds.contains(id)).length;
              final pct = totalModules > 0 ? ((doneCount / totalModules) * 100).round() : 0;
              
              builtRows.add({
                'id': userId,
                'name': u['name'] ?? u['email'] ?? 'Unknown',
                'email': u['email'] ?? '',
                'headshotUrl': u['headshotUrl'] ?? '',
                'done': doneCount,
                'total': totalModules,
                'pct': pct,
              });
            }
          } catch (e) {
            print('Error fetching progress for user ${u['id']}: $e');
          }
        }).toList();

        await Future.wait(progressFutures);
        builtRows.sort((a, b) {
          int cmp = b['pct'].compareTo(a['pct']);
          if (cmp != 0) return cmp;
          return (a['name'] as String).compareTo(b['name'] as String);
        });

        setState(() {
          _leaderboardRows = builtRows;
          _isLoadingLeaderboard = false;
        });
        return;
      }

      // For courses, use optimized leaderboard API
      if (course == null) {
        setState(() => _isLoadingLeaderboard = false);
        return;
      }

      final String url = _showTeamOnly 
        ? 'https://millerstorm.tech/api/leaderboard?courseId=${course['id']}&managerId=$_managerId'
        : 'https://millerstorm.tech/api/leaderboard?courseId=${course['id']}';

      final leaderboardResponse = await api.get(Uri.parse(url));
      
      if (leaderboardResponse.statusCode == 200) {
        final data = jsonDecode(leaderboardResponse.body);
        final List<dynamic> rows = data['rows'] ?? [];
        
        final List<Map<String, dynamic>> builtRows = rows.map((row) {
          return {
            'id': row['id'],
            'name': row['name'] ?? row['email'] ?? 'Unknown',
            'email': row['email'] ?? '',
            'headshotUrl': row['headshotUrl'] ?? '',
            'done': row['done'],
            'total': row['total'],
            'pct': row['pct'],
          };
        }).toList();

        setState(() {
          _leaderboardRows = builtRows;
          _isLoadingLeaderboard = false;
        });
      }
    } catch (e) {
      print('Error building leaderboard: $e');
      setState(() => _isLoadingLeaderboard = false);
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
          _viewType == 'courses' ? '🏆 Course Leaderboard' : '📋 Playlist Leaderboard',
          style: const TextStyle(color: _textDark, fontSize: 18, fontWeight: FontWeight.w700),
        ),
      ),
      body: _isLoadingCourses
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : Column(
              children: [
                _buildViewTypeSelector(),
                _buildDataSelector(),
                if (_viewType == 'courses') _buildLeaderboardToggle(),
                if (!_showTeamOnly && _viewType == 'courses') _buildCurrentUserRank(),
                _buildSearchBar(),
                Expanded(
                  child: _isLoadingLeaderboard
                      ? const Center(child: CircularProgressIndicator(color: _primary))
                      : _buildLeaderboardList(),
                ),
              ],
            ),
    );
  }

  Widget _buildViewTypeSelector() {
    return Container(
      color: _white,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: _bg,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Expanded(
              child: _toggleItem(
                label: 'Courses',
                isActive: _viewType == 'courses',
                onTap: () {
                  if (_viewType != 'courses') {
                    setState(() {
                      _viewType = 'courses';
                      _showTeamOnly = true;
                    });
                    if (_selectedCourse != null) _fetchLeaderboard(course: _selectedCourse);
                  }
                },
              ),
            ),
            Expanded(
              child: _toggleItem(
                label: 'Playlists',
                isActive: _viewType == 'playlists',
                onTap: () {
                  if (_viewType != 'playlists') {
                    setState(() {
                      _viewType = 'playlists';
                      _showTeamOnly = true;
                    });
                    if (_selectedPlaylist != null) {
                      _fetchLeaderboard(playlist: _selectedPlaylist);
                    } else if (_playlists.isNotEmpty) {
                      _selectedPlaylist = _playlists[0];
                      _fetchLeaderboard(playlist: _selectedPlaylist);
                    }
                  }
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDataSelector() {
    if (_viewType == 'courses') {
      return _buildCourseSelector();
    } else {
      return _buildPlaylistSelector();
    }
  }

  Widget _buildPlaylistSelector() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        color: _white,
        border: Border(bottom: BorderSide(color: _bg, width: 2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Select Playlist',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _textLight),
          ),
          const SizedBox(height: 4),
          GestureDetector(
            onTap: _showPlaylistPicker,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                border: Border.all(color: _border),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _selectedPlaylist?['name'] ?? 'Select a playlist',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: _textDark),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const Icon(Icons.keyboard_arrow_down, color: _textLight),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showPlaylistPicker() {
    if (_playlists.isEmpty) return;
    showModalBottomSheet(
      context: context,
      backgroundColor: _white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) {
        return Container(
          padding: const EdgeInsets.symmetric(vertical: 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Select Playlist', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: _playlists.length,
                  itemBuilder: (context, index) {
                    final playlist = _playlists[index];
                    final playlistId = (playlist['_id'] ?? playlist['id']).toString();
                    final selectedId = (_selectedPlaylist?['_id'] ?? _selectedPlaylist?['id']).toString();
                    final isSelected = _selectedPlaylist != null && selectedId == playlistId;
                    return ListTile(
                      title: Text(playlist['name'], style: TextStyle(color: isSelected ? _primary : _textDark, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
                      trailing: isSelected ? const Icon(Icons.check, color: _primary) : null,
                      onTap: () {
                        setState(() => _selectedPlaylist = playlist);
                        Navigator.pop(context);
                        _fetchLeaderboard(playlist: playlist);
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildCourseSelector() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        color: _white,
        border: Border(bottom: BorderSide(color: _bg, width: 2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Select Course',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _textLight),
          ),
          const SizedBox(height: 4),
          GestureDetector(
            onTap: _showCoursePicker,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                border: Border.all(color: _border),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _selectedCourse?['title'] ?? 'Select a course',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: _textDark),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const Icon(Icons.keyboard_arrow_down, color: _textLight),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showCoursePicker() {
    showModalBottomSheet(
      context: context,
      backgroundColor: _white,
      elevation: 5,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return Container(
          padding: const EdgeInsets.symmetric(vertical: 20),
          decoration: const BoxDecoration(
            color: _white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Select Course',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: _textDark),
              ),
              const SizedBox(height: 12),
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: _courses.length,
                  itemBuilder: (context, index) {
                    final course = _courses[index];
                    final courseId = (course['id'] ?? course['_id']).toString();
                    final selectedId = (_selectedCourse?['id'] ?? _selectedCourse?['_id']).toString();
                    final isSelected = _selectedCourse != null && selectedId == courseId;
                    return ListTile(
                      title: Text(
                        course['title'],
                        style: TextStyle(
                          color: isSelected ? _primary : _textDark,
                          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                        ),
                      ),
                      trailing: isSelected ? const Icon(Icons.check, color: _primary) : null,
                      onTap: () {
                        setState(() => _selectedCourse = course);
                        Navigator.pop(context);
                        _fetchLeaderboard(course: course);
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildLeaderboardToggle() {
    return Container(
      color: _white,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: _bg,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Expanded(
              child: _toggleItem(
                label: 'Team Leaderboard',
                isActive: _showTeamOnly,
                onTap: () {
                  if (!_showTeamOnly) {
                    setState(() => _showTeamOnly = true);
                    _fetchLeaderboard(course: _selectedCourse);
                  }
                },
              ),
            ),
            Expanded(
              child: _toggleItem(
                label: 'Company Leaderboard',
                isActive: !_showTeamOnly,
                onTap: () {
                  if (_showTeamOnly) {
                    setState(() => _showTeamOnly = false);
                    _fetchLeaderboard(course: _selectedCourse);
                  }
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _toggleItem({required String label, required bool isActive, required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: isActive ? _white : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          boxShadow: isActive ? [
            BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4, offset: const Offset(0, 2))
          ] : null,
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 13,
            fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
            color: isActive ? _primary : _textLight,
          ),
        ),
      ),
    );
  }

  Widget _buildCurrentUserRank() {
    if (_leaderboardRows.isEmpty || _currentUserId == null) return const SizedBox.shrink();

    final myIndex = _leaderboardRows.indexWhere((r) => r['id'] == _currentUserId);
    if (myIndex == -1) return const SizedBox.shrink();

    final myRow = _leaderboardRows[myIndex];
    final rank = myIndex + 1;

    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [_primary, _primary.withOpacity(0.8)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: _primary.withOpacity(0.3),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          _buildRankBadge(rank, large: true),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'YOUR RANKING',
                  style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1),
                ),
                Text(
                  myRow['name'],
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${myRow['pct']}%',
                style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900),
              ),
              Text(
                '${myRow['done']}/${myRow['total']} Lessons',
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: TextField(
        controller: _searchController,
        onChanged: (val) => setState(() => _searchQuery = val.toLowerCase()),
        decoration: InputDecoration(
          hintText: 'Search users...',
          hintStyle: const TextStyle(color: _textLight, fontSize: 14),
          prefixIcon: const Icon(Icons.search, color: _textLight),
          filled: true,
          fillColor: _white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
      ),
    );
  }

  Widget _buildLeaderboardList() {
    final filteredRows = _leaderboardRows.where((r) {
      final matchesSearch = r['name'].toLowerCase().contains(_searchQuery) || 
                            r['email'].toLowerCase().contains(_searchQuery);
      
      // If in Team mode, exclude the current user (manager) from the list
      if (_showTeamOnly && r['id'] == _currentUserId) return false;
      
      return matchesSearch;
    }).toList();

    if (filteredRows.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 40),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                _viewType == 'playlists' ? Icons.group_off_outlined : Icons.emoji_events_outlined, 
                size: 64, 
                color: _textLight.withOpacity(0.3)
              ),
              const SizedBox(height: 16),
              Text(
                _searchQuery.isEmpty 
                    ? (_viewType == 'playlists' ? 'No users assigned to this playlist yet.' : 'No data for this course')
                    : 'No users found',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _textDark),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: filteredRows.length,
      itemBuilder: (context, index) {
        final row = filteredRows[index];
        final rank = index + 1;
        final isMe = row['id'] == _currentUserId;

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isMe ? const Color(0xFFFEF2F2) : _white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: isMe ? _primary.withOpacity(0.3) : Colors.transparent),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 30,
                child: Center(child: _buildRankBadge(rank)),
              ),
              const SizedBox(width: 12),
              CircleAvatar(
                radius: 20,
                backgroundColor: _bg,
                backgroundImage: (row['headshotUrl'] as String).isNotEmpty
                    ? NetworkImage('https://millerstorm.tech${row['headshotUrl']}')
                    : null,
                child: (row['headshotUrl'] as String).isEmpty
                    ? const Icon(Icons.person, size: 20, color: _textLight)
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row['name'],
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: isMe ? FontWeight.bold : FontWeight.w600,
                        color: _textDark,
                      ),
                    ),
                    Text(
                      row['email'],
                      style: const TextStyle(fontSize: 11, color: _textLight),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${row['pct']}%',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: row['pct'] == 100 ? Colors.green : _textDark,
                    ),
                  ),
                  Text(
                    '${row['done']}/${row['total']}',
                    style: const TextStyle(fontSize: 10, color: _textLight),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildRankBadge(int rank, {bool large = false}) {
    if (rank <= 3) {
      String medal = '';
      if (rank == 1) medal = '🥇';
      if (rank == 2) medal = '🥈';
      if (rank == 3) medal = '🥉';
      
      return Text(medal, style: TextStyle(fontSize: large ? 32 : 20));
    }

    return Text(
      rank.toString(),
      style: TextStyle(
        fontSize: large ? 24 : 14,
        fontWeight: FontWeight.bold,
        color: large ? Colors.white : _textLight,
      ),
    );
  }
}
