import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import '../services/api_client.dart';
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
  // True when the last course fetch failed (network/API) — lets the UI show a
  // "couldn't load, retry" state instead of a misleading "No courses available".
  bool _loadError = false;
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
    final user = await AuthService.getStoredUser();
    final userId = user?['id'] ?? '';
    final userRole = user?['role'] ?? '';
    final url = Uri.parse(
        'https://millerstorm.tech/api/courses?userId=$userId&userRole=$userRole&list=1');

    // list=1 → lightweight payload (no heavy page content) for a fast list.
    // Retry a few times with a per-request timeout so a slow/blip response
    // doesn't leave the user on a false "No courses available" screen.
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        final response =
            await api.get(url).timeout(const Duration(seconds: 20));

        if (response.statusCode == 200) {
          final data = jsonDecode(response.body);
          List<dynamic> courses = data is List ? data : [];
          courses.sort((a, b) {
            final orderA = a['order'] ?? 999;
            final orderB = b['order'] ?? 999;
            return orderA.compareTo(orderB);
          });

          if (mounted) {
            setState(() {
              _courses = courses;
              _isLoading = false;
              _loadError = false;
            });
          }
          return; // success
        }
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

    // All attempts failed. Keep any courses already on screen; flag an error so
    // the UI shows "couldn't load, retry" instead of "No courses available".
    if (mounted) {
      setState(() {
        _isLoading = false;
        if (_courses.isEmpty) _loadError = true;
      });
    }
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

  void _showEditPlaylistDialog(Map<String, dynamic> playlist) async {
    final playlistId = playlist['_id'] ?? playlist['id'];
    final courseId = playlist['courseId'];
    
    // Fetch course details to get all pages
    final courseResponse = await api.get(
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
                  final response = await api.put(
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
    final salesResponse = await api.get(
      Uri.parse('https://millerstorm.tech/api/users?role=sales&managerId=$_userId'),
    );
    
    if (salesResponse.statusCode != 200) return;
    
    final salesUsers = jsonDecode(salesResponse.body) as List;
    
    // Fetch already assigned users
    final assignmentsResponse = await api.get(
      Uri.parse('https://millerstorm.tech/api/playlist-assignments?playlistId=$playlistId'),
    );
    
    final assignments = assignmentsResponse.statusCode == 200 
        ? jsonDecode(assignmentsResponse.body) as List 
        : [];
    final assignedUserIds = Set<String>.from(assignments.map((a) => a['assignedToUserId']));
    
    final availableCount = salesUsers.where((u) => !assignedUserIds.contains(u['id'])).length;
    final assignedCount = salesUsers.length - availableCount;

    showDialog(
      context: context,
      barrierColor: Colors.black.withOpacity(0.45),
      builder: (context) => DefaultTabController(
        length: 2,
        child: Dialog(
          backgroundColor: _white,
          insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 36),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          clipBehavior: Clip.antiAlias,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460, maxHeight: 580),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // ---- Branded header ----
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(20, 18, 12, 18),
                  color: _primary,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.18),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(Icons.playlist_play_rounded, color: Colors.white, size: 22),
                          ),
                          const SizedBox(width: 12),
                          const Expanded(
                            child: Text(
                              'Manage Assignments',
                              style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700),
                            ),
                          ),
                          InkWell(
                            onTap: () => Navigator.pop(context),
                            borderRadius: BorderRadius.circular(20),
                            child: const Padding(
                              padding: EdgeInsets.all(4),
                              child: Icon(Icons.close_rounded, color: Colors.white, size: 22),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Text(
                        playlist['name'] ?? '',
                        style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Icon(Icons.menu_book_rounded, size: 14, color: Colors.white.withOpacity(0.85)),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              playlist['courseName'] ?? '',
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 12.5),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                // ---- Pill tabs ----
                Container(
                  margin: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: _bg,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: TabBar(
                    indicator: BoxDecoration(
                      color: _white,
                      borderRadius: BorderRadius.circular(9),
                      boxShadow: [
                        BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 6, offset: const Offset(0, 2)),
                      ],
                    ),
                    indicatorSize: TabBarIndicatorSize.tab,
                    dividerColor: Colors.transparent,
                    splashFactory: NoSplash.splashFactory,
                    labelColor: _primary,
                    unselectedLabelColor: _textLight,
                    labelStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
                    unselectedLabelStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                    tabs: [
                      Tab(height: 38, text: 'Assign  ($availableCount)'),
                      Tab(height: 38, text: 'Assigned  ($assignedCount)'),
                    ],
                  ),
                ),
                Flexible(
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
        ),
      ),
    );
  }

  Widget _buildAssignTab(List salesUsers, Set<String> assignedUserIds, Map<String, dynamic> playlist) {
    final availableUsers = salesUsers.where((u) => !assignedUserIds.contains(u['id'])).toList();
    final selectedUsers = <String>{};
    String query = '';
    DateTime? deadline;

    return StatefulBuilder(
      builder: (context, setTabState) {
        if (availableUsers.isEmpty) {
          return _assignEmptyState(
            icon: Icons.verified_rounded,
            color: const Color(0xFF059669),
            title: "Everyone's assigned",
            subtitle: 'All your team members already have this playlist.',
          );
        }

        final filtered = query.isEmpty
            ? availableUsers
            : availableUsers.where((u) {
                final name = (u['name'] ?? '').toString().toLowerCase();
                final email = (u['email'] ?? '').toString().toLowerCase();
                return name.contains(query) || email.contains(query);
              }).toList();
        final allFilteredSelected =
            filtered.isNotEmpty && filtered.every((u) => selectedUsers.contains(u['id']));

        return Column(
          children: [
            // Search + select-all row
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
              child: Column(
                children: [
                  TextField(
                    onChanged: (v) => setTabState(() => query = v.trim().toLowerCase()),
                    decoration: InputDecoration(
                      isDense: true,
                      hintText: 'Search team members',
                      hintStyle: TextStyle(color: _textLight, fontSize: 14),
                      prefixIcon: Icon(Icons.search_rounded, size: 20, color: _textLight),
                      filled: true,
                      fillColor: _bg,
                      contentPadding: const EdgeInsets.symmetric(vertical: 11),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  Row(
                    children: [
                      Text('${filtered.length} available',
                          style: TextStyle(fontSize: 12, color: _textLight)),
                      const Spacer(),
                      TextButton(
                        style: TextButton.styleFrom(
                          foregroundColor: _primary,
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          minimumSize: const Size(0, 32),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        onPressed: filtered.isEmpty
                            ? null
                            : () => setTabState(() {
                                  if (allFilteredSelected) {
                                    for (final u in filtered) {
                                      selectedUsers.remove(u['id']);
                                    }
                                  } else {
                                    for (final u in filtered) {
                                      selectedUsers.add(u['id']);
                                    }
                                  }
                                }),
                        child: Text(allFilteredSelected ? 'Clear all' : 'Select all',
                            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Expanded(
              child: filtered.isEmpty
                  ? Center(
                      child: Text('No matches found',
                          style: TextStyle(color: _textLight, fontSize: 13)),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 2, 16, 12),
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final user = filtered[index];
                        final userId = user['id'];
                        final selected = selectedUsers.contains(userId);
                        return _selectableUserCard(
                          name: user['name'],
                          email: user['email'],
                          selected: selected,
                          onTap: () => setTabState(() {
                            if (selected) {
                              selectedUsers.remove(userId);
                            } else {
                              selectedUsers.add(userId);
                            }
                          }),
                        );
                      },
                    ),
            ),
            // Sticky action bar
            Container(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
              decoration: const BoxDecoration(
                color: _white,
                border: Border(top: BorderSide(color: Color(0xFFEEF0F3))),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Optional deadline picker (notifies the manager if not finished in time)
                  InkWell(
                    onTap: () async {
                      final now = DateTime.now();
                      final today = DateTime(now.year, now.month, now.day);
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: deadline ?? today.add(const Duration(days: 7)),
                        firstDate: today,
                        lastDate: today.add(const Duration(days: 365 * 2)),
                        builder: (context, child) => Theme(
                          data: Theme.of(context).copyWith(
                            colorScheme: const ColorScheme.light(
                              primary: _primary,
                              onPrimary: _white,
                              onSurface: _textDark,
                            ),
                          ),
                          child: child!,
                        ),
                      );
                      if (picked != null) setTabState(() => deadline = picked);
                    },
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                      decoration: BoxDecoration(
                        color: _bg,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: deadline != null ? _primary.withOpacity(0.4) : const Color(0xFFE5E7EB),
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.event_outlined,
                              size: 18, color: deadline != null ? _primary : _textLight),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              deadline != null
                                  ? 'Deadline: ${DateFormat('MMM d, yyyy').format(deadline!)}'
                                  : 'Set deadline (optional)',
                              style: TextStyle(
                                fontSize: 13.5,
                                fontWeight: deadline != null ? FontWeight.w600 : FontWeight.w500,
                                color: deadline != null ? _textDark : _textLight,
                              ),
                            ),
                          ),
                          if (deadline != null)
                            InkWell(
                              onTap: () => setTabState(() => deadline = null),
                              borderRadius: BorderRadius.circular(20),
                              child: Padding(
                                padding: const EdgeInsets.all(2),
                                child: Icon(Icons.close_rounded, size: 16, color: _textLight),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: selectedUsers.isEmpty
                      ? null
                      : () async {
                          try {
                            final managerName = (await AuthService.getStoredUser())?['name'];
                            for (final userId in selectedUsers) {
                              final user = availableUsers.firstWhere((u) => u['id'] == userId);
                              await api.post(
                                Uri.parse('https://millerstorm.tech/api/playlist-assignments'),
                                headers: {'Content-Type': 'application/json'},
                                body: jsonEncode({
                                  'playlistId': playlist['_id'] ?? playlist['id'],
                                  'playlistName': playlist['name'],
                                  'courseId': playlist['courseId'],
                                  'courseName': playlist['courseName'],
                                  'selectedModules': playlist['selectedModules'],
                                  'managerId': _userId,
                                  'managerName': managerName,
                                  'assignedToUserId': userId,
                                  'assignedToUserName': user['name'],
                                  'deadline': deadline != null
                                      ? DateFormat('yyyy-MM-dd').format(deadline!)
                                      : null,
                                }),
                              );
                            }
                            final count = selectedUsers.length;
                            Navigator.pop(context);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Assigned to $count user(s)')),
                            );
                          } catch (e) {
                            print('Error assigning playlist: $e');
                          }
                        },
                  icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
                  label: Text(
                    selectedUsers.isEmpty
                        ? 'Select members to assign'
                        : 'Assign to ${selectedUsers.length} member${selectedUsers.length > 1 ? 's' : ''}',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _primary,
                    foregroundColor: _white,
                    disabledBackgroundColor: const Color(0xFFE5E7EB),
                    disabledForegroundColor: _textLight,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildUnassignTab(List salesUsers, Set<String> assignedUserIds, List assignments, Map<String, dynamic> playlist) {
    final assignedUsers = salesUsers.where((u) => assignedUserIds.contains(u['id'])).toList();

    if (assignedUsers.isEmpty) {
      return _assignEmptyState(
        icon: Icons.group_outlined,
        color: _textLight,
        title: 'No one assigned yet',
        subtitle: 'Use the Assign tab to add team members to this playlist.',
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      itemCount: assignedUsers.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final user = assignedUsers[index];
        final assignment = assignments.firstWhere(
          (a) => a['assignedToUserId'] == user['id'],
          orElse: () => null,
        );
        final deadlineChip = _deadlineChip(assignment);
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: _white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          child: Row(
            children: [
              _userAvatar(user['name']),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user['name'] ?? '',
                        style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: _textDark)),
                    if ((user['email'] ?? '').toString().isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(user['email'] ?? '',
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: _textLight)),
                    ],
                    if (deadlineChip != null) ...[
                      const SizedBox(height: 5),
                      deadlineChip,
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                onPressed: () async {
                  try {
                    final assignment = assignments.firstWhere(
                      (a) => a['assignedToUserId'] == user['id'],
                    );
                    await api.delete(
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
                icon: const Icon(Icons.person_remove_alt_1_rounded, size: 16),
                label: const Text('Remove', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                style: OutlinedButton.styleFrom(
                  foregroundColor: _primary,
                  side: BorderSide(color: _primary.withOpacity(0.4)),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  // ---- Shared widgets for the assignment dialog ----

  /// Deadline status pill shown on an assigned user (mirrors the web manager
  /// panel): green "✓ Completed", red when overdue, amber when still upcoming.
  Widget? _deadlineChip(dynamic assignment) {
    if (assignment == null) return null;
    final raw = assignment['deadline'];
    if (raw == null) return null;
    final due = DateTime.tryParse(raw.toString());
    if (due == null) return null;

    final completed = assignment['completedAt'] != null;
    final overdue = !completed && due.isBefore(DateTime.now());
    final color = completed
        ? const Color(0xFF047857)
        : (overdue ? const Color(0xFFDC2626) : const Color(0xFFB45309));
    final label =
        '${completed ? '✓ Completed' : '⏰ Due'} ${DateFormat('MMM d, yyyy').format(due)}';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label,
          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: color)),
    );
  }

  String _initials(String? name) {
    final n = (name ?? '').trim();
    if (n.isEmpty) return '?';
    final parts = n.split(RegExp(r'\s+'));
    if (parts.length == 1) {
      return parts[0].substring(0, parts[0].length >= 2 ? 2 : 1).toUpperCase();
    }
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  Color _avatarColor(String seed) {
    const palette = [
      Color(0xFF2563EB), Color(0xFF7C3AED), Color(0xFFDB2777),
      Color(0xFF059669), Color(0xFFD97706), Color(0xFF0891B2),
    ];
    var h = 0;
    for (final c in seed.codeUnits) {
      h = (h * 31 + c) & 0x7fffffff;
    }
    return palette[h % palette.length];
  }

  Widget _userAvatar(String? name, {double size = 40}) {
    final color = _avatarColor(name ?? '?');
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: color.withOpacity(0.12), shape: BoxShape.circle),
      alignment: Alignment.center,
      child: Text(
        _initials(name),
        style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: size * 0.34),
      ),
    );
  }

  Widget _selectableUserCard({
    required String? name,
    required String? email,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? _primary.withOpacity(0.06) : _white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? _primary : const Color(0xFFE5E7EB),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            _userAvatar(name),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name ?? '',
                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: _textDark)),
                  if ((email ?? '').isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(email ?? '',
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: _textLight)),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            AnimatedContainer(
              duration: const Duration(milliseconds: 140),
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                color: selected ? _primary : Colors.transparent,
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected ? _primary : const Color(0xFFCBD5E1),
                  width: 1.5,
                ),
              ),
              child: selected ? const Icon(Icons.check_rounded, size: 16, color: Colors.white) : null,
            ),
          ],
        ),
      ),
    );
  }

  Widget _assignEmptyState({
    required IconData icon,
    required Color color,
    required String title,
    required String subtitle,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle),
              child: Icon(icon, size: 40, color: color),
            ),
            const SizedBox(height: 16),
            Text(title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _textDark)),
            const SizedBox(height: 6),
            Text(subtitle,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: _textLight, height: 1.4)),
          ],
        ),
      ),
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
      if (_loadError) {
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.cloud_off, size: 64, color: Colors.grey[400]),
                const SizedBox(height: 16),
                const Text("Couldn't load courses",
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Text('Check your internet connection and try again.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 14, color: Colors.grey[600])),
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
        );
      }
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
