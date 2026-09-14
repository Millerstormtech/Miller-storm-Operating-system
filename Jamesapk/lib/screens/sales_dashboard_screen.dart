import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/dashboard_view.dart';
import '../widgets/sales_bottom_nav.dart';

/// Sales rep (self) dashboard (PR #67). The board is the shared [DashboardView]
/// — the server returns the rep's own scope (best-month slots on each card, a
/// "You are #X of Y" rank line, a "My Months" table, and personal training
/// credentials). This supplies the Sales panel nav.
class SalesDashboardScreen extends StatelessWidget {
  const SalesDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      drawer: const SalesBottomNav(active: 'dashboard'),
      body: const SafeArea(bottom: false, child: DashboardView()),
    );
  }
}
