import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';
import '../widgets/dashboard_view.dart';

/// Sales rep (self) dashboard (PR #67). The board is the shared [DashboardView]
/// — the server returns the rep's own scope (best-month slots on each card, a
/// "You are #X of Y" rank line, a "My Months" table, and personal training
/// credentials). This supplies the Sales panel nav.
class SalesDashboardScreen extends StatelessWidget {
  const SalesDashboardScreen({super.key});

  static const _primary = Color(0xFFCB0002);

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async { await SystemNavigator.pop(); return false; },
      child: Scaffold(
        backgroundColor: AppColors.bg,
        bottomNavigationBar: _bottomNav(context),
        body: const SafeArea(bottom: false, child: DashboardView()),
      ),
    );
  }

  Widget _bottomNav(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border, width: 1)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _item(context, Icons.dashboard_outlined, 'Dashboard', true, null),
              _item(context, Icons.leaderboard_outlined, 'Sales', false, '/rankings'),
              _item(context, Icons.chat_bubble_outline, 'StormChat', false, '/stormchat'),
              _item(context, Icons.apps_outlined, 'Tools', false, '/apps-tools-items'),
              _item(context, Icons.school_outlined, 'Training', false, '/courses'),
              _item(context, Icons.person_outline, 'Profile', false, '/profile'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _item(BuildContext context, IconData icon, String label, bool active, String? route) {
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: active || route == null ? null : () => Navigator.pushReplacementNamed(context, route),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: active ? BoxDecoration(color: _primary.withOpacity(0.1), borderRadius: BorderRadius.circular(8)) : null,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: active ? _primary : AppColors.textPlaceholder, size: 22),
              const SizedBox(height: 4),
              Text(label,
                  style: TextStyle(fontSize: 9.5, color: active ? _primary : AppColors.textPlaceholder, fontWeight: active ? FontWeight.w600 : FontWeight.normal),
                  maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );
  }
}
