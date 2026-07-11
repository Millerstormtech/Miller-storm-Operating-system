import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';

const String baseUrl = 'https://millerstorm.tech';

class AuthService {
  static Future<Map<String, dynamic>> login(String email, String password) async {
    try {
      print('🔵 Attempting login to: $baseUrl/api/login');
      print('🔵 Email: $email');
      
      final response = await http.post(
        Uri.parse('$baseUrl/api/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'password': password}),
      );

      print('🔵 Response status: ${response.statusCode}');
      print('🔵 Response body: ${response.body}');

      // Check if response is HTML (error page)
      if (response.body.trim().startsWith('<')) {
        print('❌ Server returned HTML instead of JSON');
        throw Exception('Server returned HTML instead of JSON. Please check if backend is running properly.');
      }

      final data = jsonDecode(response.body);

      if (!response.statusCode.toString().startsWith('2')) {
        print('❌ Login failed: ${data['error']}');
        throw Exception(data['error'] ?? 'Login failed');
      }

      print('✅ Login successful');
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('user', jsonEncode(data));

      // Persist the server-issued token and prime the shared API client so
      // every subsequent request sends `Authorization: Bearer <token>`.
      final token = data['token'];
      if (token is String && token.isNotEmpty) {
        await prefs.setString('token', token);
        api.setToken(token);
      }
      return data;
    } catch (e) {
      print('❌ Login error: $e');
      if (e.toString().contains('SocketException') || e.toString().contains('Failed host lookup')) {
        throw Exception('Cannot connect to server. Please check your internet connection.');
      }
      rethrow;
    }
  }

  /// Requests a password reset link for [email]. Mirrors the web
  /// `/api/forgot-password` flow: the server always responds with a generic
  /// success message (anti-enumeration) and emails a reset link when the
  /// account is eligible. Returns the server message on success.
  static Future<String> forgotPassword(String email) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/forgot-password'),
        headers: {'Content-Type': 'application/json'},
        // `source: 'app'` tells the server to email a `millerstorm://` deep
        // link so the reset opens inside this app instead of the website.
        body: jsonEncode({'email': email, 'source': 'app'}),
      );

      if (response.body.trim().startsWith('<')) {
        throw Exception('Server returned HTML instead of JSON. Please check if backend is running properly.');
      }

      final data = jsonDecode(response.body);

      if (!response.statusCode.toString().startsWith('2')) {
        throw Exception(data['error'] ?? 'Failed to send reset link');
      }

      return data['message'] as String? ??
          'If an account exists with this email, you will receive a password reset link shortly.';
    } catch (e) {
      if (e.toString().contains('SocketException') || e.toString().contains('Failed host lookup')) {
        throw Exception('Cannot connect to server. Please check your internet connection.');
      }
      rethrow;
    }
  }

  /// Verifies a password-reset [token] (from the emailed deep link). Mirrors
  /// the web `GET /api/reset-password?token=`. Returns `{valid, email, name}`
  /// on success; throws with the server error message if invalid/expired.
  static Future<Map<String, dynamic>> verifyResetToken(String token) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/reset-password?token=$token'),
      );

      if (response.body.trim().startsWith('<')) {
        throw Exception('Server returned HTML instead of JSON. Please check if backend is running properly.');
      }

      final data = jsonDecode(response.body);

      if (!response.statusCode.toString().startsWith('2')) {
        throw Exception(data['error'] ?? 'Invalid or expired token');
      }

      return data;
    } catch (e) {
      if (e.toString().contains('SocketException') || e.toString().contains('Failed host lookup')) {
        throw Exception('Cannot connect to server. Please check your internet connection.');
      }
      rethrow;
    }
  }

  /// Sets a new [password] for the given reset [token]. Mirrors the web
  /// `POST /api/reset-password`. Returns the server success message.
  static Future<String> resetPassword(String token, String password) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/reset-password'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'token': token, 'password': password}),
      );

      if (response.body.trim().startsWith('<')) {
        throw Exception('Server returned HTML instead of JSON. Please check if backend is running properly.');
      }

      final data = jsonDecode(response.body);

      if (!response.statusCode.toString().startsWith('2')) {
        throw Exception(data['error'] ?? 'Failed to reset password');
      }

      return data['message'] as String? ??
          'Password reset successfully. You can now login with your new password.';
    } catch (e) {
      if (e.toString().contains('SocketException') || e.toString().contains('Failed host lookup')) {
        throw Exception('Cannot connect to server. Please check your internet connection.');
      }
      rethrow;
    }
  }

  static Future<Map<String, dynamic>?> getStoredUser() async {
    final prefs = await SharedPreferences.getInstance();
    final userStr = prefs.getString('user');
    if (userStr == null) return null;
    return jsonDecode(userStr);
  }

  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('user');
    await prefs.remove('token');
    // Keep the biometric preference so the user can still Face-ID sign back in.
    api.clearToken();
  }

  // ── Biometric (Face ID / fingerprint) login ──────────────────────────────
  // We don't store the password. After a successful password login we set a
  // flag; biometric login then just re-primes the already-stored token, which
  // the API client refreshes on its own. If the token has fully expired the next
  // request 401s and the app falls back to the normal login — safe by design.

  static const String _biometricFlagKey = 'biometric_enabled';

  /// Remember (after a password login) that this user opted into biometric login.
  static Future<void> enableBiometricLogin() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_biometricFlagKey, true);
  }

  static Future<void> disableBiometricLogin() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_biometricFlagKey, false);
  }

  /// Whether we can offer the "Login with Face ID" button: the user enabled it
  /// AND we still have a stored token + user to sign them back in with.
  static Future<bool> canUseBiometricLogin() async {
    final prefs = await SharedPreferences.getInstance();
    final enabled = prefs.getBool(_biometricFlagKey) ?? false;
    final hasToken = (prefs.getString('token') ?? '').isNotEmpty;
    final hasUser = (prefs.getString('user') ?? '').isNotEmpty;
    return enabled && hasToken && hasUser;
  }

  /// Re-prime the API client with the stored token after a passed biometric
  /// check and return the stored user (for role-based navigation).
  static Future<Map<String, dynamic>?> restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token != null && token.isNotEmpty) {
      api.setToken(token);
    }
    final userStr = prefs.getString('user');
    if (userStr == null) return null;
    return jsonDecode(userStr);
  }
}
