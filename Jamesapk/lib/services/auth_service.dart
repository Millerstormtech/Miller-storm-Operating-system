import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

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
      return data;
    } catch (e) {
      print('❌ Login error: $e');
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
  }
}
