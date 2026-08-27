import 'dart:convert';
import 'api_client.dart';

/// The Training Center category SECTION order, fetched from the web so the app
/// renders course categories in the same order as the web automatically.
///
/// The server (`/api/training/category-order`) is the single source of truth
/// (mirrors CATEGORY_DISPLAY_ORDER in src/lib/training/categories.ts). If the
/// fetch fails we fall back to a bundled copy, so ordering never breaks offline.
class CourseCategoryOrder {
  // Fallback — keep in step with CATEGORY_DISPLAY_ORDER on the web. Only used
  // when the network fetch hasn't completed or fails.
  static const List<String> _fallback = [
    'Miller Storm Certification',
    'Millionaire Knockers',
    'Roof Hustlers',
  ];

  static List<String> _order = _fallback;
  static bool _loaded = false;

  /// The current predefined-category order (cached; safe to read synchronously
  /// from a build method). Returns the web order once loaded, else the fallback.
  static List<String> get current => _order;

  /// Fetch once and cache. No-op after the first successful load.
  static Future<void> ensure() async {
    if (_loaded) return;
    await refresh();
  }

  /// Re-fetch the order from the web.
  static Future<void> refresh() async {
    try {
      final res = await api
          .get(Uri.parse('https://millerstorm.tech/api/training/category-order'))
          .timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = (data['order'] as List?)
            ?.map((e) => e.toString().trim())
            .where((s) => s.isNotEmpty)
            .toList();
        if (list != null && list.isNotEmpty) {
          _order = list;
          _loaded = true;
        }
      }
    } catch (_) {
      // Keep the fallback (or last good) order on any failure.
    }
  }
}
