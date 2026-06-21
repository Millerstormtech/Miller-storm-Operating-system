import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;

class ManagerViewTeamScreen extends StatefulWidget {
  const ManagerViewTeamScreen({super.key});

  @override
  State<ManagerViewTeamScreen> createState() => _ManagerViewTeamScreenState();
}

class _ManagerViewTeamScreenState extends State<ManagerViewTeamScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFD1D5DB);

  String? _userId;
  bool _isLoading = true;
  List<dynamic> _teamMembers = [];
  List<dynamic> _filteredMembers = [];
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadUserAndFetchData();
    _searchController.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _searchController.removeListener(_onSearchChanged);
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    _filterMembers(_searchController.text);
  }

  void _filterMembers(String query) {
    setState(() {
      if (query.isEmpty) {
        _filteredMembers = _teamMembers;
      } else {
        _filteredMembers = _teamMembers.where((member) {
          final name = (member['name'] ?? '').toString().toLowerCase();
          final email = (member['email'] ?? '').toString().toLowerCase();
          return name.contains(query.toLowerCase()) || email.contains(query.toLowerCase());
        }).toList();
      }
    });
  }

  Future<void> _loadUserAndFetchData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        _userId = _extractId(user);
        await _fetchTeamData();
      }
    } catch (e) {
      print('Error loading user data: $e');
      setState(() => _isLoading = false);
    }
  }

  String _extractId(dynamic member) {
    if (member == null) return '';
    final id = member['id'] ?? member['_id'];
    if (id == null) return '';
    if (id is Map && id.containsKey('\$oid')) {
      return id['\$oid'].toString();
    }
    return id.toString();
  }

  Future<void> _fetchTeamData() async {
    if (_userId == null || _userId!.isEmpty) return;
    setState(() => _isLoading = true);

    try {
      print('Fetching users with managerId: $_userId');
      final response = await http.get(Uri.parse('https://millerstorm.tech/api/users?role=sales&managerId=$_userId'));
      print('Users API response status: ${response.statusCode}');
      if (response.statusCode == 200) {
        final List<dynamic> allUsers = jsonDecode(response.body);
        print('Users received: ${allUsers.length}');
        
        setState(() {
          _teamMembers = allUsers;
          _filteredMembers = allUsers;
          _isLoading = false;
        });
      }
    } catch (e) {
      print('Error fetching team data: $e');
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _white,
        elevation: 0,
        title: const Text(
          'My Team',
          style: TextStyle(
            color: _textDark,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: _textDark),
            onPressed: _fetchTeamData,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(
            color: _border.withOpacity(0.5),
            height: 1.0,
          ),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : Column(
              children: [
                _buildSearchBar(),
                Expanded(
                  child: _filteredMembers.isEmpty
                      ? _buildEmptyState()
                      : ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: _filteredMembers.length,
                          itemBuilder: (context, index) {
                            final member = _filteredMembers[index];
                            return _buildMemberCard(member);
                          },
                        ),
                ),
              ],
            ),
      bottomNavigationBar: _buildBottomNav(context),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      padding: const EdgeInsets.all(16),
      color: _white,
      child: TextField(
        controller: _searchController,
        decoration: InputDecoration(
          hintText: 'Search team members...',
          hintStyle: TextStyle(color: _textPlaceholder, fontSize: 14),
          prefixIcon: Icon(Icons.search, color: _textPlaceholder, size: 20),
          filled: true,
          fillColor: _bg,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: _primary.withOpacity(0.5), width: 1),
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.group_outlined, size: 64, color: _textPlaceholder),
          const SizedBox(height: 16),
          Text(
            'No team members found',
            style: TextStyle(fontSize: 18, color: _textLight, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  Widget _buildMemberCard(dynamic member) {
    final headshotUrl = member['headshotUrl']?.toString() ?? '';
    final fullImageUrl = headshotUrl.isNotEmpty 
        ? (headshotUrl.startsWith('http') ? headshotUrl : 'https://millerstorm.tech$headshotUrl')
        : '';

    return GestureDetector(
      onTap: () {
        Navigator.pushNamed(
          context,
          '/manager-team-member-detail',
          arguments: member,
        );
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: _white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 25,
              backgroundColor: _primary.withOpacity(0.1),
              backgroundImage: fullImageUrl.isNotEmpty ? NetworkImage(fullImageUrl) : null,
              child: fullImageUrl.isEmpty ? Text(
                (member['name'] ?? 'U')[0].toUpperCase(),
                style: const TextStyle(color: _primary, fontWeight: FontWeight.bold, fontSize: 20),
              ) : null,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    member['name'] ?? 'Unknown User',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: _textDark,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    member['email'] ?? 'No email',
                    style: TextStyle(
                      fontSize: 13,
                      color: _textLight,
                    ),
                  ),
                  if (member['phone'] != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      member['phone'],
                      style: TextStyle(
                        fontSize: 13,
                        color: _textLight,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: _primary.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text(
                'Sales',
                style: TextStyle(
                  color: _primary,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _white,
        border: const Border(top: BorderSide(color: _border, width: 1)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _navItem(Icons.school_outlined, 'Training', '/manager-training', context),
              _navItem(Icons.chat_bubble_outline, 'StormChat', '/manager-stormchat', context),
              _navItem(Icons.apps_outlined, 'Apps & Tools', '/manager-apps-tools-items', context),
              _navItemActive(Icons.group_outlined, 'View Team'),
              _navItem(Icons.person_outline, 'Profile', '/manager-profile', context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItem(IconData icon, String label, String route, BuildContext context) {
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => Navigator.pushReplacementNamed(context, route),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          color: Colors.transparent,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: _textPlaceholder, size: 24),
              const SizedBox(height: 4),
              Text(label, style: const TextStyle(fontSize: 10, color: _textPlaceholder), textAlign: TextAlign.center),
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
        decoration: BoxDecoration(color: _primary.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: _primary, size: 24),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 10, color: _primary, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
