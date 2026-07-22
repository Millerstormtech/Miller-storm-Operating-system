import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Shared navigator key used by [MaterialApp] (and the FCM service) so that
/// low-level code such as the API client can navigate — e.g. force a clean
/// re-login when the server rejects an expired/invalid token.
final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();

const String _apiBase = 'https://millerstorm.tech';

/// Outcome of a token-refresh attempt. We distinguish a genuine rejection
/// (server said our token is invalid) from a transient failure (network
/// error / timeout / 5xx). Only a genuine rejection should ever log the user
/// out — a transient failure must keep the session so a flaky connection never
/// signs anyone out.
enum _RefreshResult { ok, rejected, transient }

// Refresh the token once it has less than this long left before expiry, so the
// user never actually hits an expired-token 401 during normal use. Kept wide (7
// days) relative to the 30-day server token so any user who opens the app even
// occasionally gets a fresh token long before the old one can expire.
const int _refreshThresholdSeconds = 7 * 24 * 60 * 60; // 7 days

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
  Future<_RefreshResult>? _refreshInFlight;

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

  /// Force a token refresh right now — called on every app launch and whenever
  /// the app returns to the foreground. This resets the session's 1-year clock
  /// each time the user opens the app, so an active user never hits an expired
  /// token (and never sees the "No courses available" state). No-op if the user
  /// isn't logged in. Fire-and-forget safe; shares the in-flight refresh.
  Future<void> refreshTokenNow() async {
    final t = await _getToken();
    if (t != null && t.isNotEmpty) {
      await _refreshToken();
    }
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
      final result = await _refreshToken();
      if (result == _RefreshResult.ok) {
        if (retryTemplate != null) {
          // Replay the original request once with the fresh token.
          retryTemplate.headers['Authorization'] = 'Bearer $_cachedToken';
          final retryResponse = await _inner.send(retryTemplate);
          if (retryResponse.statusCode == 401) {
            // Even a brand-new token is rejected — the session is truly invalid.
            _handleUnauthorized();
          }
          return retryResponse;
        }
        // Refreshed OK but this request type can't be replayed (streamed/
        // multipart). The token is now valid, so keep the session — the next
        // request will succeed. Do NOT log out.
        return response;
      }
      if (result == _RefreshResult.rejected) {
        // Server explicitly rejected our token (expired/invalid) — real logout.
        _handleUnauthorized();
      }
      // _RefreshResult.transient (network error / timeout / 5xx): keep the
      // session so a flaky connection never signs the user out. The caller just
      // sees this one 401; a later request refreshes and recovers.
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
  /// callers share a single in-flight refresh. Returns whether the token was
  /// updated, genuinely rejected, or transiently unreachable.
  Future<_RefreshResult> _refreshToken() {
    return _refreshInFlight ??= _doRefresh().whenComplete(() {
      _refreshInFlight = null;
    });
  }

  Future<_RefreshResult> _doRefresh() async {
    final current = _cachedToken;
    if (current == null || current.isEmpty) return _RefreshResult.rejected;
    try {
      final resp = await _inner
          .post(
            Uri.parse('$_apiBase/api/refresh-token'),
            headers: {'Authorization': 'Bearer $current'},
          )
          .timeout(const Duration(seconds: 10));
      if (resp.statusCode == 200) {
        final data = jsonDecode(resp.body);
        final newToken = data['token'];
        if (newToken is String && newToken.isNotEmpty) {
          _cachedToken = newToken;
          _loaded = true;
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('token', newToken);
          return _RefreshResult.ok;
        }
        // 200 but no token in the body — treat as transient, not a rejection.
        return _RefreshResult.transient;
      }
      // The server actively rejected the token (expired/invalid). Anything else
      // (5xx, 502 from a proxy, etc.) is a transient server problem, not a
      // reason to sign the user out.
      if (resp.statusCode == 401 || resp.statusCode == 403) {
        return _RefreshResult.rejected;
      }
      return _RefreshResult.transient;
    } catch (_) {
      // Network error / timeout — keep the session.
      return _RefreshResult.transient;
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
