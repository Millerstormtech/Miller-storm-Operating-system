import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Bottom navigation for the Branch Manager panel:
///
///   Dashboard · Sales · StormChat · Tools · Training · Profile
class BranchManagerBottomNav extends StatelessWidget {
  /// One of: 'dashboard', 'leaderboard', 'stormchat', 'apps', 'training', 'profile'.
  final String active;
  const BranchManagerBottomNav({super.key, required this.active});

  static const _primary = Color(0xFFCB0002);

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border, width: 1)),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, -2)),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _item(context, Icons.dashboard_outlined, 'Dashboard', 'dashboard', '/bm-dashboard'),
              _item(context, Icons.leaderboard_outlined, 'Sales', 'leaderboard', '/bm-rankings'),
              _item(context, Icons.chat_bubble_outline, 'StormChat', 'stormchat', '/bm-stormchat'),
              _item(context, Icons.apps_outlined, 'Tools', 'apps', '/bm-apps-tools-items'),
              _item(context, Icons.school_outlined, 'Training', 'training', '/bm-training'),
              _item(context, Icons.person_outline, 'Profile', 'profile', '/bm-profile'),
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
              Icon(icon, color: active ? _primary : AppColors.textPlaceholder, size: 22),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 9.5,
                  color: active ? _primary : AppColors.textPlaceholder,
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
