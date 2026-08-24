import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  String _role = 'sales';
  bool _showPassword = false;
  bool _showConfirmPassword = false;
  bool _isLoading = false;
  bool _success = false;
  String _error = '';
  // Sales reps pick a Branch + Team (Sales Team Lead) at registration.
  String _branch = '';
  String? _managerId;
  List<Map<String, dynamic>> _teamLeads = [];

  @override
  void initState() {
    super.initState();
    _fetchTeamLeads();
  }

  Future<void> _fetchTeamLeads() async {
    try {
      final res = await api.get(Uri.parse('$baseUrl/api/public/team-leads'));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data is List && mounted) {
          setState(() => _teamLeads = data.map((e) => Map<String, dynamic>.from(e)).toList());
        }
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _handleRegister() async {
    if (!_formKey.currentState!.validate()) return;
    if (_passwordController.text != _confirmPasswordController.text) {
      setState(() => _error = 'Passwords do not match');
      return;
    }
    if (_role == 'sales') {
      if (_branch.isEmpty) { setState(() => _error = 'Please select your Branch.'); return; }
      if (_managerId == null || _managerId!.isEmpty) {
        setState(() => _error = 'Please select your Team (Sales Team Lead).');
        return;
      }
    }
    setState(() { _isLoading = true; _error = ''; });
    try {
      final response = await api.post(
        Uri.parse('$baseUrl/api/user-requests'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'name': _nameController.text.trim(),
          'email': _emailController.text.trim(),
          'password': _passwordController.text.trim(),
          'role': _role,
          'branch': _role == 'sales' ? _branch : '',
          'managerId': _role == 'sales' ? (_managerId ?? '') : '',
        }),
      );
      final data = jsonDecode(response.body);
      if (response.statusCode == 201) {
        setState(() => _success = true);
      } else {
        setState(() => _error = data['error'] ?? 'Registration failed');
      }
    } catch (e) {
      setState(() => _error = 'Cannot connect to server. Please check your internet connection.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Container(
                    width: double.infinity,
                    constraints: const BoxConstraints(maxWidth: 400),
                    padding: const EdgeInsets.all(32),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.08),
                          blurRadius: 24,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: _success ? _buildSuccess() : _buildForm(),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Text(
                '© 2026-2027 Miller Storm. All Rights Reserved.',
                style: TextStyle(fontSize: 11, color: AppColors.textPlaceholder),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSuccess() {
    return Column(
      children: [
        Image.asset('assets/images/logo.jpeg', width: 180, height: 96, fit: BoxFit.contain),
        const SizedBox(height: 24),
        const Icon(Icons.check_circle, color: Color(0xFF16a34a), size: 48),
        const SizedBox(height: 12),
        const Text(
          'Request Submitted!',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Color(0xFF16a34a)),
        ),
        const SizedBox(height: 8),
        Text(
          'Your registration request has been sent to administration. You will receive access within 24 hours.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: AppColors.textLight),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          height: 44,
          child: ElevatedButton(
            onPressed: () => Navigator.pushReplacementNamed(context, '/login'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFCB0002),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text('Back to Login', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          ),
        ),
      ],
    );
  }

  Widget _buildForm() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Image.asset('assets/images/logo.jpeg', width: 180, height: 96, fit: BoxFit.contain),
          const SizedBox(height: 16),
          Text(
            'The Miller Storm Operating System',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textDark),
          ),
          const SizedBox(height: 4),
          Text('Register for Access', style: TextStyle(fontSize: 13, color: AppColors.textLight)),
          const SizedBox(height: 24),
          if (_error.isNotEmpty) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFFEE2E2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(_error, style: const TextStyle(color: Color(0xFFCB0002), fontSize: 13)),
            ),
            const SizedBox(height: 16),
          ],
          _fieldLabel('Full Name'),
          const SizedBox(height: 6),
          TextFormField(
            controller: _nameController,
            decoration: _inputDecoration('John Doe'),
            validator: (v) => (v == null || v.isEmpty) ? 'Name required' : null,
          ),
          const SizedBox(height: 16),
          _fieldLabel('Work Email'),
          const SizedBox(height: 6),
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: _inputDecoration('you@company.com'),
            validator: (v) => (v == null || v.isEmpty) ? 'Email required' : null,
          ),
          const SizedBox(height: 16),
          _fieldLabel('Role'),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            value: _role,
            decoration: _inputDecoration(''),
            items: const [
              DropdownMenuItem(value: 'sales', child: Text('Sales')),
              DropdownMenuItem(value: 'sales-team-lead', child: Text('Sales Team Lead')),
              DropdownMenuItem(value: 'marketing', child: Text('Marketing')),
            ],
            onChanged: (v) => setState(() {
              _role = v!;
              if (_role != 'sales') { _branch = ''; _managerId = null; }
            }),
          ),
          if (_role == 'sales') ...[
            const SizedBox(height: 16),
            _fieldLabel('Branch *'),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: _branch.isEmpty ? null : _branch,
              decoration: _inputDecoration(''),
              hint: const Text('Select branch'),
              items: const [
                DropdownMenuItem(value: 'Fort Worth', child: Text('Fort Worth')),
                DropdownMenuItem(value: 'Dallas', child: Text('Dallas')),
                DropdownMenuItem(value: 'West Texas', child: Text('West Texas')),
              ],
              // Team leads are branch-scoped, so a new branch clears the team.
              onChanged: (v) => setState(() { _branch = v ?? ''; _managerId = null; }),
            ),
            const SizedBox(height: 16),
            _fieldLabel('Team *'),
            const SizedBox(height: 6),
            Builder(builder: (_) {
              final scoped = _teamLeads
                  .where((tl) => (tl['territory'] ?? '').toString().trim().toLowerCase() == _branch.trim().toLowerCase())
                  .toList();
              final validId = scoped.any((tl) => tl['id'].toString() == _managerId);
              return DropdownButtonFormField<String>(
                value: validId ? _managerId : null,
                decoration: _inputDecoration(''),
                hint: Text(_branch.isEmpty ? 'Select a branch first' : 'Select your Sales Team Lead'),
                items: scoped
                    .map((tl) => DropdownMenuItem(
                          value: tl['id'].toString(),
                          child: Text((tl['name'] ?? 'Unknown').toString()),
                        ))
                    .toList(),
                onChanged: _branch.isEmpty ? null : (v) => setState(() => _managerId = v),
              );
            }),
          ],
          const SizedBox(height: 16),
          _fieldLabel('Password'),
          const SizedBox(height: 6),
          TextFormField(
            controller: _passwordController,
            obscureText: !_showPassword,
            decoration: _inputDecoration('Enter your password').copyWith(
              suffixIcon: IconButton(
                icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility, size: 18, color: AppColors.textPlaceholder),
                onPressed: () => setState(() => _showPassword = !_showPassword),
              ),
            ),
            validator: (v) {
              if (v == null || v.isEmpty) return 'Password required';
              if (v.length < 6) return 'Password must be at least 6 characters';
              return null;
            },
          ),
          const SizedBox(height: 16),
          _fieldLabel('Confirm Password'),
          const SizedBox(height: 6),
          TextFormField(
            controller: _confirmPasswordController,
            obscureText: !_showConfirmPassword,
            decoration: _inputDecoration('Confirm your password').copyWith(
              suffixIcon: IconButton(
                icon: Icon(_showConfirmPassword ? Icons.visibility_off : Icons.visibility, size: 18, color: AppColors.textPlaceholder),
                onPressed: () => setState(() => _showConfirmPassword = !_showConfirmPassword),
              ),
            ),
            validator: (v) => (v == null || v.isEmpty) ? 'Please confirm password' : null,
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 44,
            child: ElevatedButton(
              onPressed: _isLoading ? null : _handleRegister,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFCB0002),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: _isLoading
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Submit Request', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            ),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: () => Navigator.pushReplacementNamed(context, '/login'),
            child: const Text('Already have an account? Sign In', style: TextStyle(fontSize: 13, color: Color(0xFFCB0002))),
          ),
        ],
      ),
    );
  }

  Widget _fieldLabel(String label) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.textLight)),
    );
  }

  InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: AppColors.textPlaceholder, fontSize: 14),
      filled: true,
      fillColor: AppColors.surfaceAlt,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: AppColors.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: AppColors.border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFCB0002), width: 1.5)),
    );
  }
}
