import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Shared navigator key used by [MaterialApp] (and the FCM service) so that
/// low-level code such as the API client can navigate — e.g. force a clean
/// re-login when the server rejects an expired/invalid token.
final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();

const String _apiBase = 'https://millerstorm.tech';

// Refresh the token once it has less than this long left before expiry, so the
// user never actually hits an expired-token 401 during normal use.
const int _refreshThresholdSeconds = 2 * 24 * 60 * 60; // 2 days

/// Global HTTP client that automatically attaches the server-issued JWT as an
/// `Authorization: Bearer <token>` header on every request.
///
/// It keeps the session alive with a sliding refresh: before a token nears
/// expiry it silently swaps it for a fresh one via `/api/refresh-token`, and if
/// a request still comes back 401 it makes one refresh+retry attempt before
/// giving up and forcing a clean re-login. This avoids the previous behaviour
/// where a week-old token would abruptly log the user out mid-request.
///
/// Use the shared [api] instance instead of the top-level `http.get/post/...`
/// functions for all authenticated API calls.
class AuthClient extends http.BaseClient {
  final http.Client _inner = http.Client();
  String? _cachedToken;
  bool _loaded = false;
  // One-shot guard so a burst of parallel 401s triggers a single redirect.
  bool _handlingUnauthorized = false;
  // De-dupes concurrent refreshes: parallel requests share one in-flight call.
  Future<bool>? _refreshInFlight;

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
    if (sentToken) {
      if (!request.headers.containsKey('Authorization')) {
        request.headers['Authorization'] = 'Bearer $token';
      }
      // Kick off a background refresh (fire-and-forget) if the token is close
      // to expiring. The current request still uses the old, still-valid token.
      _maybeProactiveRefresh(token);
    }

    // Capture a re-sendable copy BEFORE the body stream is consumed, so we can
    // transparently replay the request after a refresh if it 401s.
    final http.BaseRequest? retryTemplate = sentToken ? _cloneRequest(request) : null;

    final response = await _inner.send(request);

    // We attached a token but the server rejected it (401 = expired/invalid;
    // 403 = wrong role, which we deliberately ignore).
    if (response.statusCode == 401 && sentToken) {
      final refreshed = await _refreshToken();
      if (refreshed && retryTemplate != null) {
        // Replay the original request once with the fresh token.
        retryTemplate.headers['Authorization'] = 'Bearer $_cachedToken';
        final retryResponse = await _inner.send(retryTemplate);
        if (retryResponse.statusCode == 401) {
          _handleUnauthorized();
        }
        return retryResponse;
      }
      // Couldn't refresh (or can't replay this request type) — force re-login.
      _handleUnauthorized();
    }
    return response;
  }

  /// Best-effort clone of a request so it can be replayed after a refresh.
  /// Handles the common `http.Request` (used by get/post/put/delete with an
  /// encoded body). Streamed/multipart requests can't be safely replayed, so we
  /// return null and fall back to a re-login for those.
  http.BaseRequest? _cloneRequest(http.BaseRequest request) {
    if (request is http.Request) {
      final copy = http.Request(request.method, request.url)
        ..headers.addAll(request.headers)
        ..followRedirects = request.followRedirects
        ..maxRedirects = request.maxRedirects
        ..persistentConnection = request.persistentConnection
        ..bodyBytes = request.bodyBytes;
      copy.encoding = request.encoding;
      return copy;
    }
    return null;
  }

  /// Reads the `exp` (unix seconds) out of our HMAC token
  /// (`base64url(payload).sig`). Returns null if it can't be parsed.
  int? _tokenExp(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 2) return null;
      var b64 = parts[0].replaceAll('-', '+').replaceAll('_', '/');
      while (b64.length % 4 != 0) {
        b64 += '=';
      }
      final payload = jsonDecode(utf8.decode(base64.decode(b64)));
      final exp = payload['exp'];
      return exp is int ? exp : null;
    } catch (_) {
      return null;
    }
  }

  void _maybeProactiveRefresh(String token) {
    final exp = _tokenExp(token);
    if (exp == null) return;
    final secondsLeft = exp - (DateTime.now().millisecondsSinceEpoch ~/ 1000);
    if (secondsLeft > 0 && secondsLeft < _refreshThresholdSeconds) {
      _refreshToken(); // fire-and-forget; no await, adds no latency
    }
  }

  /// Requests a fresh token from the server using the current token. Concurrent
  /// callers share a single in-flight refresh. Returns true if the stored token
  /// was updated.
  Future<bool> _refreshToken() {
    return _refreshInFlight ??= _doRefresh().whenComplete(() {
      _refreshInFlight = null;
    });
  }

  Future<bool> _doRefresh() async {
    final current = _cachedToken;
    if (current == null || current.isEmpty) return false;
    try {
      final resp = await _inner
          .post(
            Uri.parse('$_apiBase/api/refresh-token'),
            headers: {'Authorization': 'Bearer $current'},
          )
          .timeout(const Duration(seconds: 10));
      if (resp.statusCode != 200) return false;
      final data = jsonDecode(resp.body);
      final newToken = data['token'];
      if (newToken is String && newToken.isNotEmpty) {
        _cachedToken = newToken;
        _loaded = true;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('token', newToken);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
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
