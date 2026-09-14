import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'clevel_bottom_nav.dart';
import 'branch_manager_bottom_nav.dart';
import 'sales_bottom_nav.dart';
import 'sales_team_lead_bottom_nav.dart';
import 'marketing_bottom_nav.dart';

/// Drawer for screens reached from EVERY role's sidebar (Jayi, Announcements,
/// Support) that aren't duplicated per role like the rest of the app's
/// screens are — so, unlike every other screen's drawer, this one doesn't
/// know which role it's for ahead of time. It looks up the signed-in user's
/// role from cache and renders that role's own drawer widget, matching the
/// same left slide-in menu every other screen shows.
class RoleBottomNav extends StatefulWidget {
  const RoleBottomNav({super.key});

  @override
  State<RoleBottomNav> createState() => _RoleBottomNavState();
}

class _RoleBottomNavState extends State<RoleBottomNav> {
  String? _role;

  @override
  void initState() {
    super.initState();
    _loadRole();
  }

  Future<void> _loadRole() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final role = (jsonDecode(userStr)['role'] ?? '').toString();
        if (mounted) setState(() => _role = role);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    switch (_role) {
      case 'c-level':
        return const CLevelBottomNav(active: '');
      case 'branch-manager':
        return const BranchManagerBottomNav(active: '');
      case 'sales-team-lead':
        return const SalesTeamLeadBottomNav(active: '');
      case 'marketing':
        return const MarketingBottomNav(active: '');
      case 'sales':
        return const SalesBottomNav(active: '');
      default:
        // Still resolving the cached role (or none found) — an empty drawer
        // beats a flash of the wrong role's menu items.
        return const Drawer(child: SizedBox.shrink());
    }
  }
}
