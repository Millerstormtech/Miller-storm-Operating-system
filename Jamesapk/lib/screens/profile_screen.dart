import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _border = Color(0xFFD1D5DB);

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
  bool _isEditMode = false;
  bool _isSaving = false;
  bool _isUploadingImage = false;

  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final ImagePicker _picker = ImagePicker();

  final List<String> _availableTerritories = [
    'DFW, Texas',
    'Lubbock, Texas',
    'Round Rock, Texas',
    'Other',
  ];

  bool _showTerritoryDropdown = false;

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
                    .where((t) => t.isNotEmpty)
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
                .where((t) => t.isNotEmpty)
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
                .where((t) => t.isNotEmpty)
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
      final prefs = await SharedPreferences.getInstance();
      await prefs.clear();
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
        title: const Text(
          'Delete Account',
          style: TextStyle(color: _textDark, fontWeight: FontWeight.bold),
        ),
        content: const Text(
          'Are you sure you want to delete your account? This action cannot be undone.',
          style: TextStyle(color: _textDark),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel', style: TextStyle(color: _textLight)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete', style: TextStyle(color: _primary, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() {
      _isSaving = true;
    });

    try {
      final response = await api.delete(
        Uri.parse('https://millerstorm.tech/api/users/$_userId'),
      );

      if (response.statusCode == 200 || response.statusCode == 204) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Account deleted successfully'),
              backgroundColor: Color(0xFFCB0002),
            ),
          );
          _logout();
        }
      } else {
        throw Exception('Failed to delete account: ${response.statusCode}');
      }
    } catch (e) {
      print('Error deleting account: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to delete account: $e'),
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
          style: const TextStyle(
            color: _white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.confirmation_number_outlined, color: _white),
            onPressed: () => Navigator.pushNamed(context, '/tickets'),
            tooltip: 'Raise a Ticket',
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: _white),
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
        border: const Border(top: BorderSide(color: _border, width: 1)),
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
              _navItem(Icons.school_outlined, 'Training', false, '/courses', context),
              const SizedBox(width: 2),
              _navItem(Icons.chat_bubble_outline, 'StormChat', false, '/stormchat', context),
              const SizedBox(width: 2),
              _navItem(Icons.apps_outlined, 'Apps & Tools', false, '/apps-tools-items', context),
              const SizedBox(width: 2),
              _navItem(Icons.leaderboard_outlined, 'Leaderboard', false, '/rankings', context),
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
                          style: const TextStyle(
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
                            style: const TextStyle(
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
                  if (_managerName.isNotEmpty) ...[
                    _buildTextField(
                      label: 'Manager',
                      controller: TextEditingController(text: _managerName),
                      icon: Icons.manage_accounts_outlined,
                      enabled: false,
                      helperText: 'Assigned by admin',
                    ),
                    const SizedBox(height: 16),
                  ],
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
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                color: _white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Text(
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
                        'Delete Account',
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
          if (_managerName.isNotEmpty) ...[
            _buildTextField(
              label: 'Manager',
              controller: TextEditingController(text: _managerName),
              icon: Icons.manage_accounts_outlined,
              enabled: false,
              helperText: 'Assigned by admin',
            ),
            const SizedBox(height: 16),
          ],
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
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        color: _white,
                        strokeWidth: 2,
                      ),
                    )
                  : const Text(
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
                'Delete Account',
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

  Widget _buildTerritoryField() {
    String displayText = _userTerritories.isEmpty ? 'Select Territory' : _userTerritories.join(', ');
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Territory',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: _textDark,
          ),
        ),
        const SizedBox(height: 8),
        GestureDetector(
          onTap: () {
            setState(() {
              _showTerritoryDropdown = !_showTerritoryDropdown;
            });
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: _white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _showTerritoryDropdown ? _primary : _border, width: _showTerritoryDropdown ? 2 : 1),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    displayText,
                    style: TextStyle(
                      fontSize: 16,
                      color: _userTerritories.isEmpty ? _textLight : _textDark,
                    ),
                  ),
                ),
                Icon(
                  _showTerritoryDropdown ? Icons.arrow_drop_up : Icons.arrow_drop_down,
                  color: _textLight,
                ),
              ],
            ),
          ),
        ),
        if (_showTerritoryDropdown) ...[
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: _white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _border),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.1),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              children: _availableTerritories.map((territory) {
                final isSelected = _userTerritories.contains(territory);
                return InkWell(
                  onTap: () {
                    setState(() {
                      if (isSelected) {
                        _userTerritories.remove(territory);
                      } else {
                        _userTerritories.add(territory);
                      }
                    });
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: isSelected ? _primary.withOpacity(0.05) : Colors.transparent,
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 20,
                          height: 20,
                          decoration: BoxDecoration(
                            color: isSelected ? _primary : Colors.transparent,
                            border: Border.all(
                              color: isSelected ? _primary : _border,
                              width: 2,
                            ),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: isSelected
                              ? const Icon(
                                  Icons.check,
                                  size: 14,
                                  color: _white,
                                )
                              : null,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            territory,
                            style: TextStyle(
                              fontSize: 16,
                              color: _textDark,
                              fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
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
          style: const TextStyle(
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
            helperStyle: const TextStyle(
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
                style: const TextStyle(
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
