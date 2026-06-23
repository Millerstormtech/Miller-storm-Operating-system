import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Global HTTP client that automatically attaches the server-issued JWT as an
/// `Authorization: Bearer <token>` header on every request.
///
/// Use the shared [api] instance instead of the top-level `http.get/post/...`
/// functions for all authenticated API calls. Its `get`/`post`/`put`/`delete`
/// methods are signature-compatible with the top-level `http` functions, so
/// existing call sites only need `http.` swapped for `api.`.
class AuthClient extends http.BaseClient {
  final http.Client _inner = http.Client();
  String? _cachedToken;
  bool _loaded = false;

  Future<String?> _getToken() async {
    if (_loaded) return _cachedToken;
    final prefs = await SharedPreferences.getInstance();
    _cachedToken = prefs.getString('token');
    _loaded = true;
    return _cachedToken;
  }

  /// Update the in-memory token immediately after login so the very next
  /// request carries it (avoids a round-trip to SharedPreferences).
  void setToken(String? token) {
    _cachedToken = (token != null && token.isNotEmpty) ? token : null;
    _loaded = true;
  }

  void clearToken() {
    _cachedToken = null;
    _loaded = true;
  }

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final token = await _getToken();
    if (token != null && token.isNotEmpty &&
        !request.headers.containsKey('Authorization')) {
      request.headers['Authorization'] = 'Bearer $token';
    }
    return _inner.send(request);
  }
}

/// Shared authenticated HTTP client used across the app.
final AuthClient api = AuthClient();
