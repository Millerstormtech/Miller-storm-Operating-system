import 'dart:convert';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../screens/announcements_screen.dart';
import '../screens/jays_ai_clone_screen.dart';
import '../screens/ai_clone_chat_screen.dart';

/// Left slide-in navigation drawer for the Branch Manager panel — replaces
/// the old bottom bar (same items, same routes), opened via a hamburger
/// button each screen adds to its own header. Matches the web sidebar's
/// role: a collapsible menu on the left, not pinned across the bottom.
///
///   Dashboard · Sales · StormChat · Tools · Training ·
///   Course Leaderboard · Jayi · Announcements · Support · Profile
///
/// Kept the class name BranchManagerBottomNav (not renamed to *Drawer) so
/// every existing call site only needed its Scaffold slot changed
/// (bottomNavigationBar -> drawer), not an import + class rename everywhere.
class BranchManagerBottomNav extends StatelessWidget {
  /// One of: 'dashboard', 'leaderboard', 'stormchat', 'apps', 'training', 'profile'.
  final String active;
  const BranchManagerBottomNav({super.key, required this.active});

  static const _primary = Color(0xFFCB0002);

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: AppColors.surface,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
              child: Text(
                'Miller Storm',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.textDark),
              ),
            ),
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  _item(context, Icons.dashboard_outlined, 'My Dashboard', 'dashboard', '/bm-dashboard'),
                  _item(context, Icons.leaderboard_outlined, 'Sales Leaderboard', 'leaderboard', '/bm-rankings'),
                  _item(context, Icons.chat_bubble_outline, 'StormChat', 'stormchat', '/bm-stormchat'),
                  _item(context, Icons.apps_outlined, 'Apps & Tools', 'apps', '/bm-apps-tools-items'),
                  _item(context, Icons.school_outlined, 'Training Center', 'training', '/bm-training'),
                  _actionItem(context, Icons.emoji_events_outlined, 'Course Leaderboard',
                      () => Navigator.pushNamed(context, '/bm-training-leaderboard')),
                  _actionItem(context, Icons.smart_toy_outlined, 'Jayi', () => _openJaysAi(context)),
                  _actionItem(context, Icons.campaign_outlined, 'Announcements',
                      () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AnnouncementsScreen(canCompose: true)))),
                  _actionItem(context, Icons.confirmation_number_outlined, 'Support',
                      () => Navigator.pushNamed(context, '/tickets')),
                  _actionItem(context, Icons.calendar_month_outlined, 'My Calendar',
                      () => Navigator.pushNamed(context, '/calendar')),
                  _item(context, Icons.person_outline, 'Profile', 'profile', '/bm-profile'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _item(BuildContext context, IconData icon, String label, String key, String route) {
    final active = this.active == key;
    return ListTile(
      leading: Icon(icon, color: active ? _primary : AppColors.textPlaceholder),
      title: Text(
        label,
        style: TextStyle(
          color: active ? _primary : AppColors.textDark,
          fontWeight: active ? FontWeight.w700 : FontWeight.normal,
        ),
      ),
      selected: active,
      selectedTileColor: _primary.withOpacity(0.08),
      onTap: active
          ? () => Navigator.pop(context)
          : () {
              Navigator.pop(context);
              Navigator.pushNamed(context, route); // push (not replace) so back returns here
            },
    );
  }

  // One-off destinations opened on top of whatever screen the drawer was
  // opened from — same look as _item, just no "active" state to track.
  Widget _actionItem(BuildContext context, IconData icon, String label, VoidCallback onTap) {
    return ListTile(
      leading: Icon(icon, color: AppColors.textPlaceholder),
      title: Text(label, style: TextStyle(color: AppColors.textDark)),
      onTap: () {
        Navigator.pop(context); // close the drawer first
        onTap();
      },
    );
  }

  // Same "single bot -> chat, multiple -> picker, none -> toast" logic used by
  // every panel's header Jayi icon.
  Future<void> _openJaysAi(BuildContext context) async {
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);

    // The bot lookup below is two network round-trips — show a spinner right
    // away so tapping Jayi doesn't just look like the screen froze.
    showDialog(
      context: navigator.context,
      useRootNavigator: false,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator(color: _primary)),
    );

    try {
      final user = await AuthService.getStoredUser();
      final role = user?['role']?.toString();
      final res = await api.get(Uri.parse('https://millerstorm.tech/api/ai-bots?light=1'));
      navigator.pop(); // dismiss the loading spinner
      if (res.statusCode != 200) return;
      final data = json.decode(res.body) as List;
      final assigned = data.where((b) {
        final ar = b['assignedRoles'];
        return ar is List && role != null && ar.contains(role);
      }).toList();
      if (assigned.length == 1) {
        navigator.push(MaterialPageRoute(builder: (_) => AiCloneChatScreen(bot: assigned.first)));
      } else if (assigned.length > 1) {
        navigator.push(MaterialPageRoute(builder: (_) => const JaysAiCloneScreen()));
      } else {
        messenger.showSnackBar(
          const SnackBar(content: Text('No AI assistant available yet')),
        );
      }
    } catch (_) {
      navigator.pop(); // dismiss the loading spinner on error too
    }
  }
}
