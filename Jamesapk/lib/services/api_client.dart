import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Shared navigator key used by [MaterialApp] (and the FCM service) so that
/// low-level code such as the API client can navigate — e.g. force a clean
/// re-login when the server rejects an expired/invalid token.
final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();

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
  // One-shot guard so a burst of parallel 401s triggers a single redirect.
  bool _handlingUnauthorized = false;

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
    _handlingUnauthorized = false; // fresh session — re-arm the 401 guard
  }

  void clearToken() {
    _cachedToken = null;
    _loaded = true;
  }

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final token = await _getToken();
    final sentToken = token != null && token.isNotEmpty;
    if (sentToken && !request.headers.containsKey('Authorization')) {
      request.headers['Authorization'] = 'Bearer $token';
    }

    final response = await _inner.send(request);

    // We attached a token but the server rejected it (401 = expired/invalid;
    // 403 = wrong role, which we deliberately ignore). Force a clean re-login
    // instead of leaving the user staring at blank pages.
    if (response.statusCode == 401 && sentToken) {
      _handleUnauthorized();
    }
    return response;
  }

  Future<void> _handleUnauthorized() async {
    if (_handlingUnauthorized) return;
    _handlingUnauthorized = true;

    clearToken();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('token');
      await prefs.remove('user');
    } catch (_) {}

    final nav = appNavigatorKey.currentState;
    if (nav != null) {
      nav.pushNamedAndRemoveUntil('/login', (route) => false);
    }
  }
}

/// Shared authenticated HTTP client used across the app.
final AuthClient api = AuthClient();
