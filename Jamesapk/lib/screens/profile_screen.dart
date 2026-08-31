import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import '../services/auth_service.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import '../theme/app_theme.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Color get _bg => AppColors.bg;
  Color get _white => AppColors.surface;
  static const _primary = Color(0xFFCB0002);
  Color get _textDark => AppColors.textDark;
  Color get _textLight => AppColors.textLight;
  Color get _border => AppColors.border;

  String _userName = 'User';
  String _userEmail = '';
  String _userRole = 'Sales Rep';
  String _userPhone = '';
  List<String> _userTerritories = [];
  String _userStrengths = '';
  String _userWeaknesses = '';
  String _userHeadshotUrl = '';
  String? _userId;
  String _managerName = '';
  String _branchManagerName = '';
  bool _isEditMode = false;
  bool _isSaving = false;
  bool _isUploadingImage = false;

  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final ImagePicker _picker = ImagePicker();

  // Real branches (same list the admin User Management "Branch" field uses).
  final List<String> _availableTerritories = [
    'Dallas',
    'West Texas',
    'Fort Worth',
  ];


  @override
  void initState() {
    super.initState();
    _loadUserData();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _loadUserData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        final userId = user['id'] ?? user['_id'];
        
        // Fetch fresh data from API
        try {
          final response = await api.get(
            Uri.parse('https://millerstorm.tech/api/users/$userId'),
          );
          
          if (response.statusCode == 200) {
            final freshUser = jsonDecode(response.body);
            // Update SharedPreferences with fresh data
            await prefs.setString('user', jsonEncode(freshUser));
            
            setState(() {
              _userId = freshUser['id'] ?? freshUser['_id'];
              _userName = freshUser['name'] ?? 'User';
              _userEmail = freshUser['email'] ?? '';
              _userRole = freshUser['role'] ?? 'Sales Rep';
              _userPhone = freshUser['phone'] ?? '';
              
              _nameController.text = _userName;
              _phoneController.text = _userPhone;
              
              // Parse territory string (format: "DFW, Texas · Lubbock, Texas")
              if (freshUser['territory'] != null && freshUser['territory'].toString().isNotEmpty) {
                _userTerritories = freshUser['territory']
                    .toString()
                    .split('·')
                    .map((t) => t.trim())
                    .where((t) => t.isNotEmpty && _availableTerritories.contains(t))
                    .toList();
              } else {
                _userTerritories = [];
              }
              
              _userStrengths = freshUser['strengths'] ?? '';
              _userWeaknesses = freshUser['weaknesses'] ?? '';
              _userHeadshotUrl = freshUser['headshotUrl'] ?? '';
            });

            // Fetch manager name if managerId exists
            final managerId = freshUser['managerId'];
            if (managerId != null && managerId.toString().isNotEmpty) {
              _fetchManagerName(managerId.toString());
            }
            _fetchBranchManager();
            return;
          }
        } catch (e) {
          print('Error fetching fresh user data: $e');
          // Fall back to cached data if API fails
        }
        
        // Use cached data if API call fails
        setState(() {
          _userId = user['id'] ?? user['_id'];
          _userName = user['name'] ?? 'User';
          _userEmail = user['email'] ?? '';
          _userRole = user['role'] ?? 'Sales Rep';
          _userPhone = user['phone'] ?? '';
          
          _nameController.text = _userName;
          _phoneController.text = _userPhone;
          
          // Parse territory string (format: "DFW, Texas · Lubbock, Texas")
          if (user['territory'] != null && user['territory'].toString().isNotEmpty) {
            _userTerritories = user['territory']
                .toString()
                .split('·')
                .map((t) => t.trim())
                .where((t) => t.isNotEmpty && _availableTerritories.contains(t))
                .toList();
          } else {
            _userTerritories = [];
          }
          
          _userStrengths = user['strengths'] ?? '';
          _userWeaknesses = user['weaknesses'] ?? '';
          _userHeadshotUrl = user['headshotUrl'] ?? '';
        });

        // Fetch manager name if managerId exists
        final managerId = user['managerId'];
        if (managerId != null && managerId.toString().isNotEmpty) {
          _fetchManagerName(managerId.toString());
        }
        _fetchBranchManager();
      }
    } catch (e) {
      print('Error loading user data: $e');
    }
  }

  Future<void> _fetchManagerName(String managerId) async {
    try {
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/users/$managerId'),
      );
      if (response.statusCode == 200) {
        final manager = jsonDecode(response.body);
        setState(() {
          _managerName = manager['name'] ?? '';
        });
      }
    } catch (e) {
      print('Error fetching manager: $e');
    }
  }

  // The Branch Manager for this rep's branch (read-only). Resolved from the org
  // chart: the branch-manager account whose branch matches the rep's territory.
  Future<void> _fetchBranchManager() async {
    try {
      final res = await api.get(Uri.parse('https://millerstorm.tech/api/org-chart'));
      if (res.statusCode == 200) {
        final users = (jsonDecode(res.body) as List).cast<Map<String, dynamic>>();
        final branches = _userTerritories.map((t) => t.trim().toLowerCase()).toSet();
        final bm = users.firstWhere(
          (u) =>
              (u['role'] == 'branch-manager' || ((u['roles'] as List?)?.contains('branch-manager') ?? false)) &&
              branches.contains((u['territory'] ?? '').toString().trim().toLowerCase()),
          orElse: () => <String, dynamic>{},
        );
        if (mounted) setState(() => _branchManagerName = (bm['name'] ?? '').toString());
      }
    } catch (e) {
      print('Error fetching branch manager: $e');
    }
  }

  void _enterEditMode() {
    setState(() {
      _isEditMode = true;
      _nameController.text = _userName;
      _phoneController.text = _userPhone;
    });
  }

  void _cancelEdit() {
    setState(() {
      _isEditMode = false;
    });
  }

  Future<void> _pickAndUploadImage() async {
    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 85,
      );

      if (image == null) return;

      setState(() {
        _isUploadingImage = true;
      });

      final request = http.MultipartRequest(
        'POST',
        Uri.parse('https://millerstorm.tech/api/upload-image'),
      );

      request.files.add(
        await http.MultipartFile.fromPath('file', image.path),
      );

      final streamedResponse = await api.send(request);
      final response = await http.Response.fromStream(streamedResponse);

      print('Upload response status: ${response.statusCode}');
      print('Upload response body: ${response.body}');

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final imageUrl = data['url'];

        // Update user profile with new headshot
        final updateResponse = await api.put(
          Uri.parse('https://millerstorm.tech/api/users/$_userId'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'headshotUrl': imageUrl}),
        );

        print('Update user response status: ${updateResponse.statusCode}');
        print('Update user response body: ${updateResponse.body}');

        if (updateResponse.statusCode == 200) {
          final updatedUser = jsonDecode(updateResponse.body);
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('user', jsonEncode(updatedUser));

          setState(() {
            _userHeadshotUrl = imageUrl;
          });

          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Profile image updated successfully'),
                backgroundColor: Color(0xFFCB0002),
              ),
            );
          }
        } else {
          throw Exception('Failed to update user profile: ${updateResponse.statusCode}');
        }
      } else {
        throw Exception('Failed to upload image: ${response.statusCode} - ${response.body}');
      }
    } catch (e) {
      print('Error uploading image: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to upload image: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } finally {
      setState(() {
        _isUploadingImage = false;
      });
    }
  }

  Future<void> _saveProfile() async {
    setState(() {
      _isSaving = true;
    });

    try {
      print('Saving profile for user ID: $_userId');
      
      // Convert territories array to string with " · " separator
      final territoryString = _userTerritories.join(' · ');
      
      final response = await api.put(
        Uri.parse('https://millerstorm.tech/api/users/$_userId'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'name': _nameController.text,
          'phone': _phoneController.text,
          'territory': territoryString,
        }),
      );

      print('Response status: ${response.statusCode}');
      print('Response body: ${response.body}');

      if (response.statusCode == 200) {
        final updatedUser = jsonDecode(response.body);
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('user', jsonEncode(updatedUser));

        setState(() {
          _userName = updatedUser['name'] ?? _userName;
          _userPhone = updatedUser['phone'] ?? '';
          
          // Parse territory string back to array
          if (updatedUser['territory'] != null && updatedUser['territory'].toString().isNotEmpty) {
            _userTerritories = updatedUser['territory']
                .toString()
                .split('·')
                .map((t) => t.trim())
                .where((t) => t.isNotEmpty && _availableTerritories.contains(t))
                .toList();
          } else {
            _userTerritories = [];
          }
          
          _userStrengths = updatedUser['strengths'] ?? '';
          _userWeaknesses = updatedUser['weaknesses'] ?? '';
          _isEditMode = false;
        });

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Profile updated successfully'),
              backgroundColor: Color(0xFFCB0002),
            ),
          );
        }
      } else {
        throw Exception('Failed to update profile: ${response.statusCode}');
      }
    } catch (e) {
      print('Error saving profile: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update profile: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() {
        _isSaving = false;
      });
    }
  }

  Future<void> _logout() async {
    try {
      // Use AuthService.logout (NOT prefs.clear) so the biometric snapshot is
      // preserved — clearing everything wiped it and hid the Face ID button.
      await AuthService.logout();
      if (mounted) {
        Navigator.pushReplacementNamed(context, '/login');
      }
    } catch (e) {
      print('Error logging out: $e');
    }
  }

  Future<void> _deleteAccount() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(
          'Request Account Deletion',
          style: TextStyle(color: _textDark, fontWeight: FontWeight.bold),
        ),
        content: Text(
          'Send a request to an admin to delete your account? Your account stays active until an admin approves the request.',
          style: TextStyle(color: _textDark),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text('Cancel', style: TextStyle(color: _textLight)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Send Request', style: TextStyle(color: _primary, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() {
      _isSaving = true;
    });

    try {
      // Don't delete — ask an admin to. The account stays active until approved.
      final response = await api.patch(
        Uri.parse('https://millerstorm.tech/api/users/$_userId'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'action': 'request-deletion'}),
      );

      if (response.statusCode == 200) {
        // Sign out right away: the account is locked until an admin approves or
        // rejects the request (login shows the pending popup meanwhile).
        if (mounted) {
          await showDialog<void>(
            context: context,
            builder: (ctx) => AlertDialog(
              backgroundColor: _white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              title: Text('Request sent', style: TextStyle(color: _textDark, fontWeight: FontWeight.bold)),
              content: Text(
                "Your account deletion request was sent to an admin. You'll be signed out until it's approved or rejected.",
                style: TextStyle(color: _textDark),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('OK', style: TextStyle(color: Color(0xFFCB0002), fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          );
          if (mounted) _logout();
        }
      } else {
        throw Exception('Failed to send request: ${response.statusCode}');
      }
    } catch (e) {
      print('Error requesting account deletion: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to send request: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async {
        Navigator.pushReplacementNamed(context, '/courses');
        return false;
      },
      child: Scaffold(
        backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _primary,
        elevation: 0,
        title: Text(
          'Profile',
          style: TextStyle(
            color: _white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.confirmation_number_outlined, color: _white),
            onPressed: () => Navigator.pushNamed(context, '/tickets'),
            tooltip: 'Support',
          ),
          AnimatedBuilder(
            animation: themeController,
            builder: (context, _) => IconButton(
              icon: Icon(themeController.isDark ? Icons.light_mode : Icons.dark_mode, color: _white),
              onPressed: () => themeController.toggle(),
              tooltip: themeController.isDark ? 'Light Mode' : 'Dark Mode',
            ),
          ),
          IconButton(
            icon: Icon(Icons.logout, color: _white),
            onPressed: _logout,
            tooltip: 'Logout',
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _buildViewMode(),
          ),
          _buildBottomNav(context),
        ],
      ),
      ),
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _white,
        border: Border(top: BorderSide(color: _border, width: 1)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _navItem(Icons.dashboard_outlined, 'Dashboard', false, '/sales-dashboard', context),
              const SizedBox(width: 2),
              _navItem(Icons.leaderboard_outlined, 'Sales', false, '/rankings', context),
              const SizedBox(width: 2),
              _navItem(Icons.chat_bubble_outline, 'StormChat', false, '/stormchat', context),
              const SizedBox(width: 2),
              _navItem(Icons.apps_outlined, 'Tools', false, '/apps-tools-items', context),
              const SizedBox(width: 2),
              _navItem(Icons.school_outlined, 'Training', false, '/courses', context),
              const SizedBox(width: 2),
              _navItemActive(Icons.person_outline, 'Profile'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItem(IconData icon, String label, bool active, String? route, BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: route != null ? () => Navigator.pushReplacementNamed(context, route) : null,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                color: const Color(0xFF9CA3AF),
                size: 24,
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 10,
                  color: Color(0xFF9CA3AF),
                ),
                maxLines: 1,
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
              style: const TextStyle(
                fontSize: 10,
                color: _primary,
                fontWeight: FontWeight.w600,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildViewMode() {
    return RefreshIndicator(
      onRefresh: _loadUserData,
      color: _primary,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: Column(
          children: [
            Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: _primary,
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(26),
                  bottomRight: Radius.circular(26),
                ),
              ),
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  Stack(
                    children: [
                      CircleAvatar(
                        radius: 40,
                        backgroundColor: _white.withOpacity(0.2),
                        backgroundImage: _userHeadshotUrl.isNotEmpty
                            ? NetworkImage('https://millerstorm.tech$_userHeadshotUrl')
                            : null,
                        child: _userHeadshotUrl.isEmpty
                            ? Icon(Icons.person, color: _white, size: 40)
                            : null,
                      ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: GestureDetector(
                          onTap: _isUploadingImage ? null : _pickAndUploadImage,
                          child: Container(
                            width: 30,
                            height: 30,
                            decoration: BoxDecoration(
                              color: _white,
                              shape: BoxShape.circle,
                              border: Border.all(color: _primary, width: 2),
                            ),
                            child: _isUploadingImage
                                ? Padding(
                                    padding: const EdgeInsets.all(6),
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: _primary,
                                    ),
                                  )
                                : Icon(Icons.camera_alt, color: _primary, size: 14),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _userName,
                          style: TextStyle(
                            color: _white,
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _userEmail,
                          style: TextStyle(
                            color: _white.withOpacity(0.9),
                            fontSize: 13,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          decoration: BoxDecoration(
                            color: _white.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Text(
                            _userRole.toUpperCase(),
                            style: TextStyle(
                              color: _white,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 2),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildTextField(
                    label: 'Full Name',
                    controller: _nameController,
                    icon: Icons.person_outline,
                  ),
                  const SizedBox(height: 16),
                  _buildTextField(
                    label: 'Email',
                    controller: TextEditingController(text: _userEmail),
                    icon: Icons.email_outlined,
                    enabled: false,
                    helperText: 'Email cannot be changed',
                  ),
                  const SizedBox(height: 16),
                  _buildTextField(
                    label: 'Phone',
                    controller: _phoneController,
                    icon: Icons.phone_outlined,
                    hint: 'Your mobile number',
                  ),
                  const SizedBox(height: 16),
                  _buildTerritoryField(),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _isSaving ? null : _saveProfile,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _primary,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: _isSaving
                          ? SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                color: _white,
                                strokeWidth: 2,
                              ),
                            )
                          : Text(
                              'Save Changes',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: _white,
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: _isSaving ? null : _deleteAccount,
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        side: const BorderSide(color: _primary),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: const Text(
                        'Request Account Deletion',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: _primary,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEditMode() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildTextField(
            label: 'Full Name',
            controller: _nameController,
            icon: Icons.person_outline,
          ),
          const SizedBox(height: 16),
          _buildTextField(
            label: 'Email',
            controller: TextEditingController(text: _userEmail),
            icon: Icons.email_outlined,
            enabled: false,
            helperText: 'Email cannot be changed',
          ),
          const SizedBox(height: 16),
          _buildTextField(
            label: 'Phone',
            controller: _phoneController,
            icon: Icons.phone_outlined,
            hint: 'Your mobile number',
          ),
          const SizedBox(height: 16),
          _buildTerritoryField(),
          const SizedBox(height: 16),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _isSaving ? null : _saveProfile,
              style: ElevatedButton.styleFrom(
                backgroundColor: _primary,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _isSaving
                  ? SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        color: _white,
                        strokeWidth: 2,
                      ),
                    )
                  : Text(
                      'Save Changes',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: _white,
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: _isSaving ? null : _deleteAccount,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                side: const BorderSide(color: _primary),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text(
                'Request Account Deletion',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: _primary,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // Branch, Sales Team Lead, and Branch Manager — all READ-ONLY. They are set at
  // registration / by an admin in User Management; the rep cannot change them here.
  Widget _buildTerritoryField() {
    final branch = _userTerritories.isEmpty ? '—' : _userTerritories.join(', ');
    const note = 'Set by your admin — cannot be changed here';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildTextField(
          label: 'Branch',
          controller: TextEditingController(text: branch),
          icon: Icons.apartment_outlined,
          enabled: false,
          helperText: note,
        ),
        const SizedBox(height: 16),
        _buildTextField(
          label: 'Sales Team Lead',
          controller: TextEditingController(text: _managerName.isNotEmpty ? _managerName : '—'),
          icon: Icons.manage_accounts_outlined,
          enabled: false,
          helperText: note,
        ),
        const SizedBox(height: 16),
        _buildTextField(
          label: 'Branch Manager',
          controller: TextEditingController(text: _branchManagerName.isNotEmpty ? _branchManagerName : '—'),
          icon: Icons.badge_outlined,
          enabled: false,
          helperText: note,
        ),
      ],
    );
  }

  Widget _buildTextField({
    required String label,
    required TextEditingController controller,
    required IconData icon,
    String? hint,
    String? helperText,
    bool enabled = true,
    int maxLines = 1,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: _textDark,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          enabled: enabled,
          maxLines: maxLines,
          style: TextStyle(
            fontSize: 16,
            color: enabled ? _textDark : _textLight,
          ),
          decoration: InputDecoration(
            hintText: hint,
            helperText: helperText,
            helperStyle: TextStyle(
              fontSize: 12,
              color: _textLight,
            ),
            prefixIcon: Icon(icon, color: enabled ? _textLight : _border),
            filled: true,
            fillColor: enabled ? _white : _bg,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: _border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: _border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: _primary, width: 2),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: _border),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildMenuItem({
    required IconData icon,
    required String title,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: _white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: _bg,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: _textDark, size: 22),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: _textDark,
                ),
              ),
            ),
            Icon(Icons.chevron_right, color: _textLight, size: 24),
          ],
        ),
      ),
    );
  }
}
