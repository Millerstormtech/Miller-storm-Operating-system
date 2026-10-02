// Long names must show in full on the dashboard and the StormChat list.
//
// Kept apart from long_names_test.dart because both screens reach the chat
// room, which uses image_editor_plus: that package does not compile on
// Flutter 3.47+ until it is upgraded, and a compile error would stop every
// test in the file from running.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:millerstorm_app/screens/storm_chat_screen.dart';
import 'package:millerstorm_app/widgets/dashboard_view.dart';

import 'support/long_names_harness.dart';

void main() {
  setUpAll(loadRealFonts);

  Map<String, Object> dashboard(Map<String, Object> breakdown) => {
        'dashboard': {
          'scope': {'level': 'branch', 'label': 'Dallas', 'branch': 'Dallas', 'viewer': longName},
          'hero': {'revenue': 250000, 'contracts': 12, 'year': '2026'},
          'cards': {
            for (final m in ['revenue', 'contracts', 'claims', 'knocks'])
              m: {
                'value': 100,
                'top': [
                  {'name': longName, 'value': 90},
                  {'name': longName2, 'value': 60},
                ],
              },
          },
          'breakdown': breakdown,
          'training': {'pct': 72, 'headcount': 8, 'top': [{'name': longName2, 'pct': 95}]},
          'lowestKnocks': {'from': '2026-09-01', 'to': '2026-09-30', 'reps': [{'id': 'k', 'name': longKing, 'knocks': 3}]},
        },
      };

  testWidgets('dashboard (reps view) shows long names in full', (tester) async {
    await pumpScreen(tester, const Scaffold(body: DashboardView()), {
      '/api/dashboard': dashboard({
        'kind': 'rep',
        'reps': [
          {'name': longKing, 'revenue': 50000, 'contracts': 3, 'claims': 4, 'knocks': 120},
        ],
      }),
       }, height: 4000);
    expectShownInFull(tester, [longName, longName2, longKing]);
  });

  testWidgets('dashboard (teams view) shows long team and leader names in full', (tester) async {
    await pumpScreen(tester, const Scaffold(body: DashboardView()), {
      '/api/dashboard': dashboard({
        'kind': 'team',
        'groups': [
          {
            'key': longTeam,
            'totals': {'revenue': 50000, 'contracts': 3},
            'yearTotals': {'revenue': 500000, 'contracts': 30},
            'leaders': {
              'revenue': {'name': longKing, 'value': 30000},
              'claims': {'name': longName2, 'value': 4},
              'knocks': {'name': longName, 'value': 300},
            },
          },
        ],
      }),
    }, height: 4000);
    expectShownInFull(tester, [longKing, longName2, longName, longTeam.toUpperCase()]);
  });

  testWidgets('StormChat list shows long group and person names in full', (tester) async {
    await pumpScreen(tester, const StormChatScreen(), {
      '/api/storm-chat/groups': [
        {'_id': 'g1', 'name': longGroup, 'isMember': true, 'members': ['me'], 'description': 'Storm updates'},
        {'_id': 'd1', 'isDirect': true, 'isMember': true, 'members': ['me', 'b'], 'dmOther': {'id': 'b', 'name': longName2}},
      ],
      '/api/storm-chat/unread-counts': {},
      '/api/storm-chat/mention-counts': {},
    });
    expectShownInFull(tester, [longGroup, longName2]);
  });
}
