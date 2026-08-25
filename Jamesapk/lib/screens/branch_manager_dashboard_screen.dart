import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';
import '../widgets/dashboard_view.dart';
import '../widgets/branch_manager_bottom_nav.dart';

/// Branch Manager role dashboard (PR #67). The board is the shared
/// [DashboardView] — the server returns the branch scope (teams as the breakdown,
/// a rank line in the hero, training scoped to the branch); this supplies the nav.
class BranchManagerDashboardScreen extends StatelessWidget {
  const BranchManagerDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async { await SystemNavigator.pop(); return false; },
      child: Scaffold(
        backgroundColor: AppColors.bg,
        bottomNavigationBar: const BranchManagerBottomNav(active: 'dashboard'),
        body: const SafeArea(bottom: false, child: DashboardView()),
      ),
    );
  }
}
