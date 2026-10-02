// Long names must show in full, not cut off with "...".
//
// Each test opens a real screen on a phone-sized display, with the app's API
// replaced by canned responses full of very long names, then checks that no
// piece of text containing one of those names was truncated — and, because
// any layout overflow fails a widget test, that letting names wrap didn't
// break the layout either. (The dashboard and StormChat list are covered in
// long_names_chat_dashboard_test.dart.)
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:millerstorm_app/screens/apps_tools_items_screen.dart';
import 'package:millerstorm_app/screens/profile_screen.dart';
import 'package:millerstorm_app/screens/rankings_screen.dart';
import 'package:millerstorm_app/screens/ticket_screen.dart';
import 'package:millerstorm_app/screens/training_leaderboard_screen.dart';
import 'package:millerstorm_app/widgets/scoreboard_view.dart';

import 'support/long_names_harness.dart';

void main() {
  setUpAll(loadRealFonts);

  testWidgets('sales leaderboard shows long names in full', (tester) async {
    await pumpScreen(tester, const RankingsScreen(), {
      '/api/leaderboard': {
        'leaderboard': [rep('a', longName, 98765), rep('b', longName2, 54321)],
        'contractKing': {'name': longKing, 'monthLabel': 'September', 'revenue': 120000},
        'ytdPodium': [rep('a', longName, 98765), rep('b', longName2, 54321)],
      },
    });
    expectShownInFull(tester, [longName, longName2, longKing]);
  });

  testWidgets('course leaderboard shows long names, branches and teams in full', (tester) async {
    await pumpScreen(tester, const TrainingLeaderboardScreen(), {
      '/api/training/leaderboard': {
        'rows': [
          {'id': 'a', 'name': longName, 'branch': 'Dallas–Fort Worth Metroplex North', 'team': longTeam, 'pct': 87, 'done': 20, 'total': 23, 'rank': 1, 'isPodium': true, 'headshotUrl': ''},
          {'id': 'b', 'name': longName2, 'branch': 'Dallas–Fort Worth Metroplex North', 'team': longTeam, 'pct': 61, 'done': 14, 'total': 23, 'rank': 2, 'headshotUrl': ''},
        ],
        'totalCourses': 3,
        'totalItems': 23,
        'courses': [],
      },
    });
    expectShownInFull(tester, [longName, longName2, longTeam]);
  });

  testWidgets('profile shows a long name and email in full', (tester) async {
    await pumpScreen(tester, const ProfileScreen(), {
      '/api/users/me': {'id': 'me', 'name': longName, 'email': longEmail, 'role': 'sales', 'phone': ''},
    });
    expectShownInFull(tester, [longName, longEmail]);
  });

  testWidgets('Apps & Tools shows long tool names in full', (tester) async {
    await pumpScreen(tester, const AppsToolsItemsScreen(), {
      '/api/apps-tools/categories': [
        {'name': 'Estimating', 'slug': 'estimating', 'status': 'published'},
      ],
      '/api/apps-tools': [
        {'title': longTool, 'description': 'Builds the scope.', 'category': 'estimating', 'imageUrl': '', 'url': 'https://example.com'},
      ],
    });
    expectShownInFull(tester, [longTool]);
  });

  testWidgets('scoreboard podium shows long names in full', (tester) async {
    await pumpScreen(tester, const Scaffold(body: ScoreboardView(showPodiums: true)), {
      '/api/scoreboard': {},
      '/api/scoreboard/podiums': {
        'sales': [
          {'place': 1, 'name': longName, 'revenue': 90000, 'headshotUrl': ''},
          {'place': 2, 'name': longName2, 'revenue': 60000, 'headshotUrl': ''},
        ],
      },
    }, height: 3000);
    expectShownInFull(tester, [longName, longName2]);
  });

  testWidgets('ticket reasons are shown in full in the dropdown', (tester) async {
    await pumpScreen(tester, const TicketScreen(), {});
    await tester.tap(find.text('Not Selected'));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    // Every reason in the open menu, in full.
    final reasons = allParagraphs(tester).map((p) => p.text.toPlainText()).where((t) => t.contains(' — ')).toList();
    expect(reasons, isNotEmpty);
    expectShownInFull(tester, reasons);
  });
}
