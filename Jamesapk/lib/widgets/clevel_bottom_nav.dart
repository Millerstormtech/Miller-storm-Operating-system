import 'package:flutter/material.dart';

/// Bottom navigation for the C-Level panel. Visually identical to the Sales Team
/// Lead bar, but its slots and routes are C-Level's:
///
///   Training · StormChat · Tools & Products · Users · Sales
///
/// (Course Leaderboard is reached from the 🏆 button in the Training header and
/// Profile from the avatar, exactly like the Sales Team Lead panel.)
class CLevelBottomNav extends StatelessWidget {
  /// One of: 'training', 'stormchat', 'apps', 'users', 'leaderboard'.
  final String active;
  const CLevelBottomNav({super.key, required this.active});

  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFD1D5DB);

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _white,
        border: const Border(top: BorderSide(color: _border, width: 1)),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, -2)),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _item(context, Icons.school_outlined, 'Training', 'training', '/clevel-training'),
              const SizedBox(width: 2),
              _item(context, Icons.chat_bubble_outline, 'StormChat', 'stormchat', '/clevel-stormchat'),
              const SizedBox(width: 2),
              _item(context, Icons.apps_outlined, 'Tools', 'apps', '/clevel-apps-tools-items'),
              const SizedBox(width: 2),
              _item(context, Icons.manage_accounts_outlined, 'Users', 'users', '/clevel-user-management'),
              const SizedBox(width: 2),
              _item(context, Icons.leaderboard_outlined, 'Sales', 'leaderboard', '/clevel-rankings'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _item(BuildContext context, IconData icon, String label, String key, String route) {
    final active = this.active == key;
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: active ? null : () => Navigator.pushReplacementNamed(context, route),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: active
              ? BoxDecoration(color: _primary.withOpacity(0.1), borderRadius: BorderRadius.circular(8))
              : null,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: active ? _primary : _textPlaceholder, size: 24),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  color: active ? _primary : _textPlaceholder,
                  fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
