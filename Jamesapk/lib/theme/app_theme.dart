import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Global light/dark theme controller. Holds the user's choice, persists it,
/// and notifies the app to rebuild when toggled. Screens read their colors from
/// [AppColors], which flips with [isDark].
class ThemeController extends ChangeNotifier {
  static const _key = 'ms_dark_mode';
  bool _isDark = false;
  bool get isDark => _isDark;

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _isDark = prefs.getBool(_key) ?? false;
      notifyListeners();
    } catch (_) {}
  }

  Future<void> toggle() async {
    _isDark = !_isDark;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_key, _isDark);
    } catch (_) {}
  }

  Future<void> setDark(bool value) async {
    if (_isDark == value) return;
    _isDark = value;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_key, _isDark);
    } catch (_) {}
  }
}

/// Single global instance. Wire the app to rebuild on it (see main.dart).
final themeController = ThemeController();

/// Theme-aware colors. The brand red is constant; page/surface/text/border flip
/// between light and dark. Screens replace their hardcoded `static const`
/// colours with getters that read these (e.g. `Color get _bg => AppColors.bg;`).
///
/// NOTE: these are runtime getters, so widgets that reference them can no longer
/// be `const` — that's expected for a theme that switches at runtime.
class AppColors {
  static bool get isDark => themeController.isDark;

  /// Miller Storm red — identical in both themes.
  static const Color primary = Color(0xFFCB0002);

  /// Page background (was 0xFFF3F4F6).
  static Color get bg => isDark ? const Color(0xFF0D0E11) : const Color(0xFFF3F4F6);

  /// Card / panel surface (was white 0xFFFFFFFF).
  static Color get surface => isDark ? const Color(0xFF1B1D21) : const Color(0xFFFFFFFF);

  /// A slightly raised / alternate surface (chips, inputs — was 0xFFF3F4F6 on cards).
  static Color get surfaceAlt => isDark ? const Color(0xFF262A2F) : const Color(0xFFF3F4F6);

  /// Primary text (was 0xFF111827).
  static Color get textDark => isDark ? const Color(0xFFF4F5F7) : const Color(0xFF111827);

  /// Secondary text (was 0xFF6B7280).
  static Color get textLight => isDark ? const Color(0xFF9AA1AA) : const Color(0xFF6B7280);

  /// Muted / placeholder text (was 0xFF9CA3AF).
  static Color get textPlaceholder => isDark ? const Color(0xFF6B7280) : const Color(0xFF9CA3AF);

  /// Hairline borders (was 0xFFD1D5DB / 0xFFE5E7EB).
  static Color get border => isDark ? const Color(0xFF33383E) : const Color(0xFFD1D5DB);

  /// A soft shadow colour that mostly disappears in dark mode.
  static Color get shadow => isDark ? Colors.black.withValues(alpha: 0.4) : Colors.black.withValues(alpha: 0.05);
}

/// Light Material theme (for dialogs, sheets, ripples, etc.).
final ThemeData appLightTheme = ThemeData(
  brightness: Brightness.light,
  useMaterial3: true,
  fontFamily: 'sans-serif',
  scaffoldBackgroundColor: const Color(0xFFF3F4F6),
  colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFCB0002)),
  dialogTheme: const DialogThemeData(backgroundColor: Colors.white),
);

/// Dark Material theme.
final ThemeData appDarkTheme = ThemeData(
  brightness: Brightness.dark,
  useMaterial3: true,
  fontFamily: 'sans-serif',
  scaffoldBackgroundColor: const Color(0xFF0D0E11),
  colorScheme: ColorScheme.fromSeed(
    seedColor: const Color(0xFFCB0002),
    brightness: Brightness.dark,
  ),
  dialogTheme: const DialogThemeData(backgroundColor: Color(0xFF1B1D21)),
);
