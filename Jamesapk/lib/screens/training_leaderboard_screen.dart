import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/auth_service.dart';

class TrainingLeaderboardScreen extends StatefulWidget {
  const TrainingLeaderboardScreen({super.key});

  @override
  State<TrainingLeaderboardScreen> createState() => _TrainingLeaderboardScreenState();
}

class _TrainingLeaderboardScreenState extends State<TrainingLeaderboardScreen> {
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
  dynamic _selectedCourse;
  List<Map<String, dynamic>> _leaderboardRows = [];
  bool _isLoadingCourses = true;
  bool _isLoadingLeaderboard = false;
  String? _currentUserId;
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final user = await AuthService.getStoredUser();
    setState(() {
      _currentUserId = user?['id'] ?? user?['_id'] ?? '';
    });
    await _fetchCourses();
  }

  Future<void> _fetchCourses() async {
    try {
      // summary=true → only course id/title/status (no heavy page content); the
      // leaderboard rows come from the optimized /api/leaderboard endpoint.
      final response = await api.get(Uri.parse('https://millerstorm.tech/api/courses?summary=true'));
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

        if (_selectedCourse != null) {
          _fetchLeaderboard(_selectedCourse);
        }
      }
    } catch (e) {
      print('Error fetching courses: $e');
      setState(() => _isLoadingCourses = false);
    }
  }

  Future<void> _fetchLeaderboard(dynamic course) async {
    setState(() {
      _isLoadingLeaderboard = true;
      _leaderboardRows = [];
    });

    try {
      // Use optimized leaderboard API
      final leaderboardResponse = await api.get(
        Uri.parse('https://millerstorm.tech/api/leaderboard?courseId=${course['id']}')
      );
      
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
        title: const Text(
          '🏆 Course Leaderboard',
          style: TextStyle(color: _textDark, fontSize: 18, fontWeight: FontWeight.w700),
        ),
      ),
      body: _isLoadingCourses
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : Column(
              children: [
                _buildCourseSelector(),
                _buildCurrentUserRank(),
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
              Expanded(
                child: ListView.builder(
                  itemCount: _courses.length,
                  itemBuilder: (context, index) {
                    final course = _courses[index];
                    final isSelected = _selectedCourse?['id'] == course['id'];
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
                        _fetchLeaderboard(course);
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
    final filteredRows = _leaderboardRows.where((r) => 
      r['name'].toLowerCase().contains(_searchQuery) || 
      r['email'].toLowerCase().contains(_searchQuery)
    ).toList();

    if (filteredRows.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.emoji_events_outlined, size: 64, color: _textLight.withOpacity(0.3)),
            const SizedBox(height: 16),
            Text(
              _searchQuery.isEmpty ? 'No data for this course' : 'No users found',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _textDark),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: filteredRows.length,
      itemBuilder: (context, index) {
        final row = filteredRows[index];
        final rank = _leaderboardRows.indexOf(row) + 1;
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
      Color color = _textDark;
      if (rank == 1) { medal = '🥇'; color = _gold; }
      if (rank == 2) { medal = '🥈'; color = _silver; }
      if (rank == 3) { medal = '🥉'; color = _bronze; }
      
      return large 
        ? Text(medal, style: const TextStyle(fontSize: 32))
        : Text(medal, style: const TextStyle(fontSize: 20));
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
