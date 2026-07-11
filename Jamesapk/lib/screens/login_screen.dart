import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/biometric_service.dart';
import '../services/firebase_messaging_service.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _showPassword = false;
  bool _isLoading = false;
  String _error = '';
  bool _biometricAvailable = false;
  String _biometricLabel = 'Face ID';

  @override
  void initState() {
    super.initState();
    _checkBiometric();
  }

  // Show the "Login with Face ID" button only when the device has biometrics AND
  // the user previously signed in with a password on this device (so we have a
  // token to restore).
  Future<void> _checkBiometric() async {
    final canUse = await AuthService.canUseBiometricLogin();
    if (!canUse) return;
    final available = await BiometricService.isAvailable();
    if (!available) return;
    final label = await BiometricService.label();
    if (mounted) {
      setState(() {
        _biometricAvailable = true;
        _biometricLabel = label;
      });
    }
  }

  void _navigateByRole(Map<String, dynamic> user) {
    final role = user['role'] as String?;
    FirebaseMessagingService.saveTokenAfterLogin();
    if (role == 'sales') {
      Navigator.pushReplacementNamed(context, '/courses');
    } else if (role == 'manager') {
      Navigator.pushReplacementNamed(context, '/manager-training');
    } else {
      setState(() {
        _error = 'Access denied. This app is only available for Sales and Manager roles.';
      });
      AuthService.logout();
    }
  }

  Future<void> _handleBiometricLogin() async {
    setState(() => _error = '');
    final ok = await BiometricService.authenticate(
      reason: 'Sign in to Miller Storm with $_biometricLabel',
    );
    if (!ok) return;
    final user = await AuthService.restoreSession();
    if (!mounted) return;
    if (user == null) {
      setState(() => _error = 'Session expired. Please sign in with your password.');
      return;
    }
    _navigateByRole(user);
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _isLoading = true; _error = ''; });

    try {
      final user = await AuthService.login(
        _emailController.text.trim(),
        _passwordController.text.trim(),
      );
      if (!mounted) return;

      final role = user['role'] as String?;
      // Enable Face ID for next time only for the roles allowed into the app.
      if (role == 'sales' || role == 'manager') {
        await AuthService.enableBiometricLogin();
      }
      _navigateByRole(user);
    } catch (e) {
      setState(() { _error = e.toString().replaceFirst('Exception: ', ''); });
    } finally {
      if (mounted) setState(() { _isLoading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
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
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.08),
                          blurRadius: 24,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          // Logo
                          Image.asset(
                            'assets/images/logo.jpeg',
                            width: 180,
                            height: 96,
                            fit: BoxFit.contain,
                          ),
                          const SizedBox(height: 16),
                          // Title
                          const Text(
                            'The Miller Storm Operating System',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF111827),
                            ),
                          ),
                          //const SizedBox(height: 6),
                          // Subtitle
                          //const Text(
                           // 'powered by Genesis, everything- it starts here',
                           // textAlign: TextAlign.center,
                           // style: TextStyle(
                            //  fontSize: 13,
                           //   color: Color(0xFF6B7280),
                           // ),
                         // ),
                          const SizedBox(height: 24),
                          // Error
                          if (_error.isNotEmpty) ...[
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFEE2E2),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                _error,
                                style: const TextStyle(color: Color(0xFFCB0002), fontSize: 13),
                              ),
                            ),
                            const SizedBox(height: 16),
                          ],
                          // Email field
                          Align(
                            alignment: Alignment.centerLeft,
                            child: const Text(
                              'Work Email',
                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Color(0xFF374151)),
                            ),
                          ),
                          const SizedBox(height: 6),
                          TextFormField(
                            controller: _emailController,
                            keyboardType: TextInputType.emailAddress,
                            decoration: _inputDecoration('you@company.com'),
                            validator: (v) => (v == null || v.isEmpty) ? 'Email required' : null,
                          ),
                          const SizedBox(height: 16),
                          // Password field
                          Align(
                            alignment: Alignment.centerLeft,
                            child: const Text(
                              'Password',
                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Color(0xFF374151)),
                            ),
                          ),
                          const SizedBox(height: 6),
                          TextFormField(
                            controller: _passwordController,
                            obscureText: !_showPassword,
                            decoration: _inputDecoration('Enter your password').copyWith(
                              suffixIcon: IconButton(
                                icon: Icon(
                                  _showPassword ? Icons.visibility_off : Icons.visibility,
                                  size: 18,
                                  color: const Color(0xFF9CA3AF),
                                ),
                                onPressed: () => setState(() => _showPassword = !_showPassword),
                              ),
                            ),
                            validator: (v) => (v == null || v.isEmpty) ? 'Password required' : null,
                          ),
                          const SizedBox(height: 6),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: TextButton(
                              onPressed: () => Navigator.pushNamed(context, '/forgot-password'),
                              style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: Size.zero),
                              child: const Text('Forgot Password', style: TextStyle(fontSize: 13, color: Color(0xFFCB0002))),
                            ),
                          ),
                          const SizedBox(height: 20),
                          // Sign In button
                          SizedBox(
                            width: double.infinity,
                            height: 44,
                            child: ElevatedButton(
                              onPressed: _isLoading ? null : _handleLogin,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFFCB0002),
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                              ),
                              child: _isLoading
                                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                  : const Text('Sign In', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                            ),
                          ),
                          // Face ID / biometric login — only shown when the user
                          // has previously signed in on this device.
                          if (_biometricAvailable) ...[
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              height: 44,
                              child: OutlinedButton.icon(
                                onPressed: _isLoading ? null : _handleBiometricLogin,
                                icon: Icon(
                                  _biometricLabel == 'Face ID' ? Icons.face : Icons.fingerprint,
                                  size: 20,
                                  color: const Color(0xFFCB0002),
                                ),
                                label: Text(
                                  'Login with $_biometricLabel',
                                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Color(0xFFCB0002)),
                                ),
                                style: OutlinedButton.styleFrom(
                                  side: const BorderSide(color: Color(0xFFCB0002)),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                ),
                              ),
                            ),
                          ],
                          const SizedBox(height: 12),
                          TextButton(
                            onPressed: () => Navigator.pushNamed(context, '/register'),
                            child: const Text('Register', style: TextStyle(fontSize: 13, color: Color(0xFFCB0002))),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            // Footer
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: const Text(
                '© 2026-2027 Miller Storm. All Rights Reserved.',
                style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: Color(0xFF9CA3AF), fontSize: 14),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Color(0xFFCB0002), width: 1.5),
      ),
    );
  }
}
