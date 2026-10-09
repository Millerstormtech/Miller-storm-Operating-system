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
  /// The highlighted item, for a shared screen that has one in every role's
  /// menu (My DMO); '' for screens reached only as actions.
  final String active;
  const RoleBottomNav({super.key, this.active = ''});

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
        return CLevelBottomNav(active: widget.active);
      case 'branch-manager':
        return BranchManagerBottomNav(active: widget.active);
      case 'sales-team-lead':
        return SalesTeamLeadBottomNav(active: widget.active);
      case 'marketing':
        return MarketingBottomNav(active: widget.active);
      case 'sales':
        return SalesBottomNav(active: widget.active);
      default:
        // Still resolving the cached role (or none found) — an empty drawer
        // beats a flash of the wrong role's menu items.
        return const Drawer(child: SizedBox.shrink());
    }
  }
}
