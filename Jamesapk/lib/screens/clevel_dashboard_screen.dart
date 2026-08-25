import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';
import '../widgets/dashboard_view.dart';
import '../widgets/clevel_bottom_nav.dart';

/// C-Level role dashboard (PR #67). The board itself is the shared [DashboardView]
/// (the server returns the company scope); this only supplies the C-Level nav.
class CLevelDashboardScreen extends StatelessWidget {
  const CLevelDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async { await SystemNavigator.pop(); return false; },
      child: Scaffold(
        backgroundColor: AppColors.bg,
        bottomNavigationBar: const CLevelBottomNav(active: 'dashboard'),
        body: const SafeArea(bottom: false, child: DashboardView()),
      ),
    );
  }
}
