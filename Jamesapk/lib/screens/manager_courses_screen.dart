import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../services/auth_service.dart';
import 'course_detail_screen.dart';

class ManagerCoursesScreen extends StatefulWidget {
  const ManagerCoursesScreen({super.key});

  @override
  State<ManagerCoursesScreen> createState() => _ManagerCoursesScreenState();
}

class _ManagerCoursesScreenState extends State<ManagerCoursesScreen> with SingleTickerProviderStateMixin {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _blue = Color(0xFF2563EB);

  List<dynamic> _courses = [];
  List<dynamic> _myPlaylists = [];
  bool _isLoading = true;
  late TabController _tabController;
  String? _userId;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    final user = await AuthService.getStoredUser();
    _userId = user?['id'] ?? user?['_id'] ?? '';
    await Future.wait([
      _fetchCourses(),
      _fetchMyPlaylists(),
    ]);
  }

  Future<void> _fetchCourses() async {
    try {
      final user = await AuthService.getStoredUser();
      final userId = user?['id'] ?? '';
      final userRole = user?['role'] ?? '';
      
      final response = await http.get(
        Uri.parse('https://millerstorm.tech/api/courses?userId=$userId&userRole=$userRole'),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        List<dynamic> courses = data is List ? data : [];
        courses.sort((a, b) {
          final orderA = a['order'] ?? 999;
          final orderB = b['order'] ?? 999;
          return orderA.compareTo(orderB);
        });
        
        setState(() {
          _courses = courses;
          _isLoading = false;
        });
      } else {
        setState(() => _isLoading = false);
      }
    } catch (e) {
      print('Error fetching courses: $e');
      setState(() => _isLoading = false);
    }
  }

  Future<void> _fetchMyPlaylists() async {
    if (_userId == null || _userId!.isEmpty) return;
    try {
      final response = await http.get(
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

  Future<void> _deletePlaylist(String playlistId) async {
    try {
      final response = await http.delete(
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

  void _showEditPlaylistDialog(Map<String, dynamic> playlist) async {
    final playlistId = playlist['_id'] ?? playlist['id'];
    final courseId = playlist['courseId'];
    
    // Fetch course details to get all pages
    final courseResponse = await http.get(
      Uri.parse('https://millerstorm.tech/api/courses/$courseId'),
    );
    
    if (courseResponse.statusCode != 200) return;
    
    final courseData = jsonDecode(courseResponse.body);
    final pages = (courseData['pages'] as List? ?? [])
        .where((p) => p['status'] == 'published')
        .toList();
    final folders = courseData['folders'] as List? ?? [];
    
    final selectedModules = Set<String>.from(playlist['selectedModules'] ?? []);
    final nameController = TextEditingController(text: playlist['name']);
    
    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: _white,
          title: const Text('Edit Playlist'),
          content: SizedBox(
            width: double.maxFinite,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Playlist Name',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                const Text('Select Modules', style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Expanded(
                  child: SingleChildScrollView(
                    child: Column(
                      children: [
                        ...pages.where((p) => p['folderId'] == null).map((page) {
                          final pageId = page['id'];
                          return CheckboxListTile(
                            title: Text(page['title'] ?? ''),
                            value: selectedModules.contains(pageId),
                            onChanged: (val) {
                              setDialogState(() {
                                if (val == true) {
                                  selectedModules.add(pageId);
                                } else {
                                  selectedModules.remove(pageId);
                                }
                              });
                            },
                          );
                        }),
                        ...folders.map((folder) {
                          final folderId = folder['id'];
                          final folderPages = pages.where((p) => p['folderId'] == folderId).toList();
                          if (folderPages.isEmpty) return const SizedBox.shrink();
                          
                          return ExpansionTile(
                            title: Text('📁 ${folder['title']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                            children: folderPages.map((page) {
                              final pageId = page['id'];
                              return CheckboxListTile(
                                title: Text(page['title'] ?? ''),
                                value: selectedModules.contains(pageId),
                                onChanged: (val) {
                                  setDialogState(() {
                                    if (val == true) {
                                      selectedModules.add(pageId);
                                    } else {
                                      selectedModules.remove(pageId);
                                    }
                                  });
                                },
                              );
                            }).toList(),
                          );
                        }),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () async {
                if (nameController.text.trim().isEmpty || selectedModules.isEmpty) return;
                
                try {
                  final response = await http.put(
                    Uri.parse('https://millerstorm.tech/api/playlists'),
                    headers: {'Content-Type': 'application/json'},
                    body: jsonEncode({
                      'id': playlistId,
                      'name': nameController.text.trim(),
                      'selectedModules': selectedModules.toList(),
                    }),
                  );
                  
                  if (response.statusCode == 200) {
                    Navigator.pop(context);
                    await _fetchMyPlaylists();
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Playlist updated successfully')),
                    );
                  }
                } catch (e) {
                  print('Error updating playlist: $e');
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  void _showAssignPlaylistDialog(Map<String, dynamic> playlist) async {
    final playlistId = playlist['_id'] ?? playlist['id'];
    
    // Fetch sales users under this manager
    final salesResponse = await http.get(
      Uri.parse('https://millerstorm.tech/api/users?role=sales&managerId=$_userId'),
    );
    
    if (salesResponse.statusCode != 200) return;
    
    final salesUsers = jsonDecode(salesResponse.body) as List;
    
    // Fetch already assigned users
    final assignmentsResponse = await http.get(
      Uri.parse('https://millerstorm.tech/api/playlist-assignments?playlistId=$playlistId'),
    );
    
    final assignments = assignmentsResponse.statusCode == 200 
        ? jsonDecode(assignmentsResponse.body) as List 
        : [];
    final assignedUserIds = Set<String>.from(assignments.map((a) => a['assignedToUserId']));
    
    showDialog(
      context: context,
      builder: (context) => DefaultTabController(
        length: 2,
        child: AlertDialog(
          backgroundColor: _white,
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Manage Playlist Assignments'),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Playlist: ${playlist['name']}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text('Course: ${playlist['courseName']}', style: TextStyle(fontSize: 12, color: _textLight)),
                  ],
                ),
              ),
            ],
          ),
          content: SizedBox(
            width: double.maxFinite,
            height: 400,
            child: Column(
              children: [
                TabBar(
                  labelColor: _blue,
                  unselectedLabelColor: _textLight,
                  indicatorColor: _blue,
                  tabs: const [
                    Tab(text: 'Assign Users'),
                    Tab(text: 'Unassign Users'),
                  ],
                ),
                Expanded(
                  child: TabBarView(
                    children: [
                      _buildAssignTab(salesUsers, assignedUserIds, playlist),
                      _buildUnassignTab(salesUsers, assignedUserIds, assignments, playlist),
                    ],
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAssignTab(List salesUsers, Set<String> assignedUserIds, Map<String, dynamic> playlist) {
    final availableUsers = salesUsers.where((u) => !assignedUserIds.contains(u['id'])).toList();
    final selectedUsers = <String>{};
    
    return StatefulBuilder(
      builder: (context, setTabState) => Column(
        children: [
          Expanded(
            child: availableUsers.isEmpty
                ? const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.check_circle, size: 64, color: Colors.green),
                        SizedBox(height: 16),
                        Text('All users already assigned'),
                      ],
                    ),
                  )
                : ListView.builder(
                    itemCount: availableUsers.length,
                    itemBuilder: (context, index) {
                      final user = availableUsers[index];
                      final userId = user['id'];
                      return CheckboxListTile(
                        title: Text(user['name'] ?? ''),
                        subtitle: Text(user['email'] ?? ''),
                        value: selectedUsers.contains(userId),
                        onChanged: (val) {
                          setTabState(() {
                            if (val == true) {
                              selectedUsers.add(userId);
                            } else {
                              selectedUsers.remove(userId);
                            }
                          });
                        },
                      );
                    },
                  ),
          ),
          if (selectedUsers.isNotEmpty)
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: ElevatedButton(
                onPressed: () async {
                  try {
                    for (final userId in selectedUsers) {
                      final user = availableUsers.firstWhere((u) => u['id'] == userId);
                      await http.post(
                        Uri.parse('https://millerstorm.tech/api/playlist-assignments'),
                        headers: {'Content-Type': 'application/json'},
                        body: jsonEncode({
                          'playlistId': playlist['_id'] ?? playlist['id'],
                          'playlistName': playlist['name'],
                          'courseId': playlist['courseId'],
                          'courseName': playlist['courseName'],
                          'selectedModules': playlist['selectedModules'],
                          'managerId': _userId,
                          'managerName': (await AuthService.getStoredUser())?['name'],
                          'assignedToUserId': userId,
                          'assignedToUserName': user['name'],
                        }),
                      );
                    }
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Assigned to ${selectedUsers.length} user(s)')),
                    );
                  } catch (e) {
                    print('Error assigning playlist: $e');
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: _primary,
                  foregroundColor: _white,
                ),
                child: Text('Assign (${selectedUsers.length})'),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildUnassignTab(List salesUsers, Set<String> assignedUserIds, List assignments, Map<String, dynamic> playlist) {
    final assignedUsers = salesUsers.where((u) => assignedUserIds.contains(u['id'])).toList();
    
    return assignedUsers.isEmpty
        ? const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.inbox, size: 64, color: Colors.grey),
                SizedBox(height: 16),
                Text('No users assigned yet'),
              ],
            ),
          )
        : ListView.builder(
            itemCount: assignedUsers.length,
            itemBuilder: (context, index) {
              final user = assignedUsers[index];
              return Container(
                margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.green.shade200),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(user['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
                          Text(user['email'] ?? '', style: const TextStyle(fontSize: 12)),
                        ],
                      ),
                    ),
                    ElevatedButton(
                      onPressed: () async {
                        try {
                          final assignment = assignments.firstWhere(
                            (a) => a['assignedToUserId'] == user['id'],
                          );
                          await http.delete(
                            Uri.parse('https://millerstorm.tech/api/playlist-assignments?id=${assignment['_id']}'),
                          );
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Unassigned from ${user['name']}')),
                          );
                        } catch (e) {
                          print('Error unassigning playlist: $e');
                        }
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red.shade50,
                        foregroundColor: Colors.red,
                      ),
                      child: const Text('Unassign'),
                    ),
                  ],
                ),
              );
            },
          );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          color: _white,
          child: TabBar(
            controller: _tabController,
            labelColor: _blue,
            unselectedLabelColor: _textLight,
            indicatorColor: _blue,
            labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            tabs: const [
              Tab(text: 'Courses'),
              Tab(text: 'My Playlists'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildCoursesTab(),
              _buildMyPlaylistsTab(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCoursesTab() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: _primary));
    }
    if (_courses.isEmpty) {
      return const Center(child: Text('No courses available'));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _courses.length,
      itemBuilder: (context, index) {
        final course = _courses[index];
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
        return _buildPlaylistCard(playlist);
      },
    );
  }

  Widget _buildPlaylistCard(Map<String, dynamic> data) {
    final playlistName = data['name'];
    final courseName = data['courseName'];
    final moduleCount = (data['selectedModules'] as List?)?.length ?? 0;
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
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ElevatedButton(
                onPressed: () {
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
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text('View'),
              ),
              ElevatedButton(
                onPressed: () => _showEditPlaylistDialog(data),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.grey.shade100,
                  foregroundColor: _textDark,
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text('Edit'),
              ),
              ElevatedButton(
                onPressed: () => _showAssignPlaylistDialog(data),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.grey.shade100,
                  foregroundColor: _textDark,
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text('Assign'),
              ),
              ElevatedButton(
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
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
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
      statusColor = const Color(0xFF16A34A);
    } else if (progressValue == 0) {
      statusText = 'NOT STARTED';
      statusColor = const Color(0xFF6B7280);
    } else {
      statusText = 'IN PROGRESS';
      statusColor = _primary;
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
                            : Image.network(
                                coverImageUrl,
                                width: double.infinity,
                                height: 160,
                                fit: BoxFit.cover,
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
}
