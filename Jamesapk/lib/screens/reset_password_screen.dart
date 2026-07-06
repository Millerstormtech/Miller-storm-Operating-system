import 'package:flutter/material.dart';
import '../services/auth_service.dart';

class ResetPasswordScreen extends StatefulWidget {
  final String token;
  const ResetPasswordScreen({super.key, required this.token});

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

enum _Stage { verifying, invalid, form, success }

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _showPassword = false;
  bool _isLoading = false;
  String _error = '';

  _Stage _stage = _Stage.verifying;
  String _invalidMessage = '';
  String _email = '';

  @override
  void initState() {
    super.initState();
    _verifyToken();
  }

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _verifyToken() async {
    if (widget.token.isEmpty) {
      setState(() { _stage = _Stage.invalid; _invalidMessage = 'This reset link is invalid.'; });
      return;
    }
    try {
      final data = await AuthService.verifyResetToken(widget.token);
      if (!mounted) return;
      setState(() {
        _email = data['email'] as String? ?? '';
        _stage = _Stage.form;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _stage = _Stage.invalid;
        _invalidMessage = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _isLoading = true; _error = ''; });

    try {
      await AuthService.resetPassword(widget.token, _passwordController.text.trim());
      if (!mounted) return;
      setState(() { _stage = _Stage.success; });
    } catch (e) {
      setState(() { _error = e.toString().replaceFirst('Exception: ', ''); });
    } finally {
      if (mounted) setState(() { _isLoading = false; });
    }
  }

  void _goToLogin() {
    Navigator.pushNamedAndRemoveUntil(context, '/login', (route) => false);
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
                    child: _buildStage(),
                  ),
                ),
              ),
            ),
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

  Widget _buildStage() {
    switch (_stage) {
      case _Stage.verifying:
        return _wrap([
          const SizedBox(height: 8),
          const CircularProgressIndicator(color: Color(0xFFCB0002)),
          const SizedBox(height: 20),
          const Text(
            'Verifying reset link…',
            style: TextStyle(fontSize: 15, color: Color(0xFF6B7280)),
          ),
        ]);
      case _Stage.invalid:
        return _wrap([
          const Text('⚠️', style: TextStyle(fontSize: 48)),
          const SizedBox(height: 16),
          const Text(
            'Invalid Reset Link',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Color(0xFFCB0002)),
          ),
          const SizedBox(height: 12),
          Text(
            _invalidMessage.isEmpty
                ? 'This password reset link is invalid or has expired. Please request a new one.'
                : '$_invalidMessage Please request a new reset link.',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, color: Color(0xFF6B7280), height: 1.6),
          ),
          const SizedBox(height: 24),
          _primaryButton('Back to Login', _goToLogin),
        ]);
      case _Stage.success:
        return _wrap([
          const Text('✅', style: TextStyle(fontSize: 48)),
          const SizedBox(height: 16),
          const Text(
            'Password Reset',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Color(0xFF16A34A)),
          ),
          const SizedBox(height: 12),
          const Text(
            'Your password has been reset successfully. You can now login with your new password.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: Color(0xFF6B7280), height: 1.6),
          ),
          const SizedBox(height: 24),
          _primaryButton('Go to Login', _goToLogin),
        ]);
      case _Stage.form:
        return _buildForm();
    }
  }

  Widget _buildForm() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Image.asset(
            'assets/images/logo.jpeg',
            width: 180,
            height: 96,
            fit: BoxFit.contain,
          ),
          const SizedBox(height: 16),
          const Text(
            'Set a New Password',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
          ),
          if (_email.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              _email,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, color: Color(0xFF6B7280)),
            ),
          ],
          const SizedBox(height: 24),
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
          // New password
          Align(
            alignment: Alignment.centerLeft,
            child: const Text(
              'New Password',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Color(0xFF374151)),
            ),
          ),
          const SizedBox(height: 6),
          TextFormField(
            controller: _passwordController,
            obscureText: !_showPassword,
            decoration: _inputDecoration('Enter new password').copyWith(
              suffixIcon: IconButton(
                icon: Icon(
                  _showPassword ? Icons.visibility_off : Icons.visibility,
                  size: 18,
                  color: const Color(0xFF9CA3AF),
                ),
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
          // Confirm password
          Align(
            alignment: Alignment.centerLeft,
            child: const Text(
              'Confirm Password',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Color(0xFF374151)),
            ),
          ),
          const SizedBox(height: 6),
          TextFormField(
            controller: _confirmController,
            obscureText: !_showPassword,
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _handleSubmit(),
            decoration: _inputDecoration('Re-enter new password'),
            validator: (v) {
              if (v == null || v.isEmpty) return 'Please confirm your password';
              if (v != _passwordController.text) return 'Passwords do not match';
              return null;
            },
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            height: 44,
            child: ElevatedButton(
              onPressed: _isLoading ? null : _handleSubmit,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFCB0002),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: _isLoading
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Reset Password', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            ),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: _goToLogin,
            child: const Text('Back to Login', style: TextStyle(fontSize: 13, color: Color(0xFFCB0002))),
          ),
        ],
      ),
    );
  }

  Widget _wrap(List<Widget> children) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Image.asset(
          'assets/images/logo.jpeg',
          width: 180,
          height: 96,
          fit: BoxFit.contain,
        ),
        const SizedBox(height: 24),
        ...children,
      ],
    );
  }

  Widget _primaryButton(String label, VoidCallback onPressed) {
    return SizedBox(
      width: double.infinity,
      height: 44,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFFCB0002),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
        child: Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
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
