// The Sales Leaderboard's Team filter offers the teams the server sends (named
// after their lead, e.g. "Luke Huber", since teams come from User Management),
// and filtering by one shows exactly that team's reps.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:millerstorm_app/screens/branch_manager_rankings_screen.dart';
import 'package:millerstorm_app/screens/clevel_rankings_screen.dart';
import 'package:millerstorm_app/screens/marketing_rankings_screen.dart';
import 'package:millerstorm_app/screens/rankings_screen.dart';
import 'package:millerstorm_app/screens/sales_team_lead_rankings_screen.dart';

import 'support/long_names_harness.dart';

Map<String, Object> repOn(String id, String name, String team, num revenue) => {
      ...rep(id, name, revenue),
      'branch': 'Fort Worth',
      'team': team,
    };

// The board keeps light animations running, so wait a fixed time rather than
// for everything to stop.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

// Marketing lands on its My Dashboard tab; the board is the other tab.
Future<void> showBoard(WidgetTester tester, Widget screen, Map<String, Object> routes) async {
  await pumpScreen(tester, screen, routes);
  final tab = find.text('Leaderboard');
  if (tab.evaluate().isNotEmpty) {
    await tester.tap(tab);
    await settle(tester);
  }
}

Future<void> openTeamFilter(WidgetTester tester) async {
  await tester.tap(find.text('Filters').first);
  await settle(tester);
  await tester.tap(find.text('Team'));
  await settle(tester);
}

// Ticks one team, then closes both sheets to look at the board.
Future<void> pickTeam(WidgetTester tester, String team) async {
  await openTeamFilter(tester);
  await tester.tap(find.text(team).last);
  await settle(tester);
  await tester.tapAt(const Offset(180, 20));
  await settle(tester);
  await tester.tapAt(const Offset(180, 20));
  await settle(tester);
}

// Team history: Jose moved from Luke Huber's team to Daniel Reyes's on 16 Sep.
// The server splits his month into one segment per team.
Map<String, Object> segment(String team, String from, String to, num revenue, num knocks, num won) => {
      'team': team,
      'branch': 'Fort Worth',
      'from': from,
      'to': to,
      'revenue': revenue,
      'verifiedKnocks': knocks,
      'leadsCreated': 0,
      'filed': 0,
      'won': won,
    };

final movedMidMonth = {
  'leaderboard': [
    {
      ...repOn('j', 'Jose Robles', 'Daniel Reyes', 10000),
      'verifiedKnocks': 100,
      'won': 3,
      'segments': [
        segment('Luke Huber', '2026-09-01', '2026-09-15', 4000, 40, 1),
        segment('Daniel Reyes', '2026-09-16', '2026-09-30', 6000, 60, 2),
      ],
    },
    // No segments: an older server, or a rep who never moved.
    repOn('a', 'Alan Bieberle', 'Luke Huber', 9000),
    repOn('t', 'Trace Lutteringer', 'Daniel Reyes', 2000),
  ],
  'teams': ['Daniel Reyes', 'Luke Huber'],
};

// Each account type has its own copy of the Sales Leaderboard.
final screens = <String, Widget>{
  'Sales': const RankingsScreen(),
  'Team Lead': const SalesTeamLeadRankingsScreen(),
  'Branch Manager': const BranchManagerRankingsScreen(),
  'C-Level': const CLevelRankingsScreen(),
  'Marketing': const MarketingRankingsScreen(),
};

void main() {
  setUpAll(loadRealFonts);

  final rows = [
    repOn('a', 'Alan Bieberle', 'Gunner McCullough', 9000),
    repOn('b', 'Trace Lutteringer', 'Luke Huber', 8000),
  ];

  for (final MapEntry(key: who, value: screen) in screens.entries) {
    testWidgets('$who: the Team filter lists the teams in User Management, new ones included', (tester) async {
      // Maria Lopez was just made a Team Lead and has no reps on the board yet;
      // Daniel Sabedra is no longer a lead.
      await showBoard(tester, screen, {
        '/api/leaderboard': {
          'leaderboard': rows,
          'teams': ['Gunner McCullough', 'Luke Huber', 'Maria Lopez'],
        },
      });
      await openTeamFilter(tester);
      for (final t in ['Gunner McCullough', 'Luke Huber', 'Maria Lopez']) {
        expect(find.text(t), findsWidgets, reason: '"$t" missing from the Team filter');
      }
      expect(find.text('Daniel Sabedra'), findsNothing);
    });

    testWidgets('$who: picking a team shows only that team\'s reps', (tester) async {
      await showBoard(tester, screen, {
        '/api/leaderboard': {
          'leaderboard': rows,
          'teams': ['Gunner McCullough', 'Luke Huber'],
        },
      });
      expect(find.text('Alan Bieberle'), findsOneWidget);
      await pickTeam(tester, 'Luke Huber');
      expect(find.text('Trace Lutteringer'), findsOneWidget);
      expect(find.text('Alan Bieberle'), findsNothing);
    });

    testWidgets('$who: a server without the team list still gets a working filter from the board', (tester) async {
      await showBoard(tester, screen, {
        '/api/leaderboard': {'leaderboard': rows},
      });
      await openTeamFilter(tester);
      expect(find.text('Gunner McCullough'), findsWidgets);
      expect(find.text('Luke Huber'), findsWidgets);
    });

    testWidgets('$who: a rep who moved counts toward his old team until the move, with a note', (tester) async {
      await showBoard(tester, screen, {'/api/leaderboard': movedMidMonth});
      await pickTeam(tester, 'Luke Huber');
      expect(find.text('Jose Robles'), findsOneWidget);
      expect(find.text('\$4,000'), findsOneWidget, reason: "Jose's share before the move");
      expect(find.text('Moved to Daniel Reyes, 16\u00A0Sep'), findsOneWidget);
      expect(find.text('\$13,000'), findsWidgets, reason: 'team total = Alan 9,000 + Jose 4,000');
      expect(find.text('Trace Lutteringer'), findsNothing);
    });

    testWidgets('$who: and toward his new team from the move on', (tester) async {
      await showBoard(tester, screen, {'/api/leaderboard': movedMidMonth});
      await pickTeam(tester, 'Daniel Reyes');
      expect(find.text('\$6,000'), findsOneWidget, reason: "Jose's share since the move");
      expect(find.text('Joined 16\u00A0Sep'), findsOneWidget);
      expect(find.text('\$8,000'), findsWidgets, reason: 'team total = Jose 6,000 + Trace 2,000');
      expect(find.text('Alan Bieberle'), findsNothing);
    });

    testWidgets('$who: with no filter a rep who moved keeps his whole month and no note', (tester) async {
      await showBoard(tester, screen, {'/api/leaderboard': movedMidMonth});
      expect(find.text('\$10,000'), findsOneWidget);
      expect(find.textContaining('Moved to'), findsNothing);
      expect(find.textContaining('Joined'), findsNothing);
    });
  }
}
