import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/dashboard_view.dart';
import '../widgets/sales_team_lead_bottom_nav.dart';

/// Sales Team Lead role dashboard (PR #67). The board is the shared
/// [DashboardView] — the server returns the team scope (reps as the breakdown
/// table, a rank line in the hero, training scoped to the team). This supplies
/// the Sales Team Lead nav (which uses the "manager-" routes).
class SalesTeamLeadDashboardScreen extends StatelessWidget {
  const SalesTeamLeadDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      drawer: const SalesTeamLeadBottomNav(active: 'dashboard'),
      body: const SafeArea(bottom: false, child: DashboardView()),
    );
  }
}
