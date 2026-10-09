// The DMO screen (PR #94's My DMO page on the phone): what a rep, a Team Lead
// and C-level see from /api/dmo, what the weekly, monthly and adjust forms
// send, and the Dashboard's one DMO line. The fake server answers with the
// shapes src/lib/dmo/view.ts and load.ts build.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:millerstorm_app/screens/dmo_screen.dart';
import 'package:millerstorm_app/services/dmo.dart';
import 'package:millerstorm_app/widgets/dashboard_view.dart';

import 'support/long_names_harness.dart';

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Map<String, Object?> bar(String field, num actual, num target, num pace, String colour) =>
    {'field': field, 'actual': actual, 'target': target, 'pace': pace, 'colour': colour};

Map<String, num> numbers(num doors, num claims, num contracts, num dollars) =>
    {'doors': doors, 'claims': claims, 'contracts': contracts, 'contractDollars': dollars};

Map<String, Object?> commitment(String weekOf, Map<String, num> now,
        {Map<String, num>? original, List<Object> adjustments = const [], Map<String, String>? away}) =>
    {
      'weekOf': weekOf,
      'commitment': now,
      'original': original ?? now,
      'adjustments': adjustments,
      'away': away,
      'submittedAt': '2026-10-09T15:00:00.000Z',
      'late': false,
    };

/// One PersonDmo. Defaults: launch Friday (9 Oct), weekly DMO due at 1 PM,
/// no commitment this week, no monthly DMO yet.
Map<String, Object?> person({
  String id = 'me',
  String name = 'Jose Robles',
  String team = 'Luke Huber',
  String branch = 'Fort Worth',
  Map<String, Object?> chip = const {'state': 'at-risk', 'colour': 'yellow', 'doorsPace': 100, 'rampDay': null},
  Map<String, num>? actual,
  String weekOf = '2026-10-03',
  Map<String, Object?>? thisWeek,
  List<Object> weekBars = const [],
  String month = '2026-10',
  Map<String, Object?>? plan,
  Map<String, Object?>? income,
  List<Object> monthBars = const [],
  String weeklyState = 'due',
  String forWeekOf = '2026-10-10',
  String due = '2026-10-09T18:00:00.000Z',
  Map<String, Object?>? next,
  bool canAdjust = true,
  bool floorExempt = false,
  String monthlyState = 'not-open',
  String formMonth = '2026-10',
  Map<String, Object?>? formPlan,
}) {
  final did = actual ?? numbers(75, 0, 0, 0);
  return {
    'userId': id,
    'name': name,
    'role': 'sales',
    'team': team,
    'branch': branch,
    'chip': chip,
    'minimum': {'doors': did['doors'], 'claims': did['claims'], 'monthlyContractAverage': 21000},
    'thisWeek': {'weekOf': weekOf, 'commitment': thisWeek, 'actual': did, 'bars': weekBars},
    'thisMonth': {'month': month, 'plan': plan, 'income': income, 'actual': did, 'bars': monthBars},
    'weeklyForm': {
      'forWeekOf': forWeekOf,
      'state': weeklyState,
      'due': due,
      'lock': '2026-10-09T22:00:00.000Z',
      'canAdjust': canAdjust,
      'commitment': next,
      'floorExempt': floorExempt,
    },
    'monthlyForm': {'month': formMonth, 'state': monthlyState, 'due': '2026-11-02T05:59:59.000Z', 'plan': formPlan},
  };
}

Map<String, Object?> groupDmo(String key, String owner,
        {String? colour = 'yellow', int green = 3, int counted = 4, int members = 5, List<Object> bars = const []}) =>
    {
      'key': key,
      'owner': owner,
      'colour': colour,
      'green': green,
      'counted': counted,
      'members': members,
      'thisWeek': {'commitment': numbers(450, 4, 1, 20000), 'actual': numbers(300, 2, 1, 9000), 'bars': bars},
      'nextWeek': {'commitment': numbers(450, 4, 1, 20000), 'submitted': 3},
      'weeklyDone': 3,
      'monthlyDone': 0,
      'monthlyDue': false,
    };

Map<String, Object> board({
  required String variant,
  required String level,
  Map<String, Object?>? me,
  List<Object?> people = const [],
  Map<String, Object?>? total,
  List<Object> groups = const [],
  List<Object> slipping = const [],
  Map<String, String> names = const {},
  String weekOf = '2026-10-03',
}) =>
    {
      'variant': variant,
      'dmo': {
        'clock': {'today': '2026-10-09', 'weekOf': weekOf, 'dayOfWeek': 7, 'nextWeekOf': '2026-10-10', 'month': '2026-10'},
        'scope': {'level': level},
        'me': me,
        'people': people.isEmpty && me != null ? [me] : people,
        'total': total,
        'groups': groups,
        'slipping': slipping,
        'names': names,
      },
    };

List<http.Request> sent(String path) => sentRequests.where((r) => r.url.path == path).toList();
Map<String, dynamic> bodyOf(String path) => jsonDecode(sent(path).single.body) as Map<String, dynamic>;

Future<void> type(WidgetTester tester, String label, String value) async {
  final field = find.descendant(
    of: find.ancestor(of: find.text(label), matching: find.byType(Column)).first,
    matching: find.byType(TextField),
  );
  await tester.enterText(field, value);
  await tester.pump();
}

void main() {
  setUpAll(loadRealFonts);

  group('the rules the phone repeats', () {
    test("income calculator matches the web's (Jay's example)", () {
      final a = dmoIncomePlan(10000, 5000, 31)!;
      expect([a.roofsNeeded, a.claimsNeeded, a.weeklyClaims], [2, 4, 0.9]);
      final b = dmoIncomePlan(12000, 5000, 28)!;
      expect([b.roofsNeeded, b.claimsNeeded, b.weeklyClaims, b.weeklyClaimsLabel], [3, 6, 1.5, '1.5']);
      expect(dmoIncomePlan(0, 5000, 30), isNull);
      expect(dmoIncomePlan(10000, 0, 30), isNull);
    });

    test('deadlines read in Central time, summer and winter', () {
      expect(dmoTimeLabel('2026-10-09T18:00:00.000Z'), 'Fri 1:00 PM CT'); // CDT
      expect(dmoTimeLabel('2026-11-13T19:00:00.000Z'), 'Fri 1:00 PM CT'); // CST
      expect(dmoDayLabel('2026-10-10'), 'Sat, Oct 10');
      expect(dmoMonthLabel('2026-11'), 'November 2026');
      expect(dmoDaysInMonth('2026-02'), 28);
      expect(dmoMoney(40000), r'$40,000');
      expect(dmoPlural(1, 'claim'), '1 claim');
    });
  });

  testWidgets('a rep on launch Friday sees the weekly DMO is due and sends it', (tester) async {
    final me = person();
    await pumpScreen(tester, const DmoScreen(), {
      '/api/dmo': board(variant: 'sales', level: 'self', me: me),
      '/api/dmo/weekly': {'ok': true, 'weekOf': '2026-10-10', 'late': false},
    }, height: 2000);

    expect(find.text('My DMO'), findsOneWidget);
    expect(find.text('Your weekly DMO is due Fri 1:00 PM CT.'), findsOneWidget);
    expect(find.text('At risk'), findsOneWidget);
    expect(find.text('75 / 100'), findsOneWidget);
    expect(find.text('0 / 1'), findsOneWidget);
    expect(find.text(r'$21,000 / $40K'), findsOneWidget);
    expect(find.text('Pace for today: 100 doors'), findsOneWidget);
    expect(find.text("No commitment for this week. Your weekly DMO on Friday sets next week's."), findsOneWidget);
    expect(find.text('Monthly DMOs start in November.'), findsOneWidget);
    expect(find.text('NEXT WEEK (SAT, OCT 10)'), findsOneWidget);
    expect(find.text('Not done yet'), findsOneWidget);

    await tester.tap(find.text('Fill it in'));
    await settle(tester);
    expect(find.text('Weekly DMO'), findsOneWidget);
    expect(find.text('Due Fri 1:00 PM CT'), findsOneWidget);
    expect(find.text(r'No commitment for this week. So far: 75 doors, 0 claims, 0 contracts, $0.'), findsOneWidget);
    expect(find.text('NEXT WEEK, SAT, OCT 10 TO FRI, OCT 16'), findsOneWidget);
    // Starts at Jay's minimum.
    expect(find.widgetWithText(TextField, '100'), findsOneWidget);

    await type(tester, 'Doors', '150');
    await tester.tap(find.text("I'll be away (vacation, out of town)"));
    await tester.pump();
    expect(find.text('Sat, Oct 10'), findsOneWidget);
    expect(find.text('Fri, Oct 16'), findsOneWidget);
    await tester.enterText(find.byWidgetPredicate((w) => w is TextField && w.maxLength == 200), 'Wedding');
    await tester.pump();

    await tester.tap(find.text('Submit'));
    await settle(tester);
    expect(bodyOf('/api/dmo/weekly'), {
      'doors': 150,
      'claims': 1,
      'contracts': 0,
      'contractDollars': 0,
      'away': {'from': '2026-10-10', 'to': '2026-10-16', 'reason': 'Wedding'},
    });
    // Back on the DMO, reloaded.
    expect(find.text('Weekly DMO'), findsNothing);
    expect(sent('/api/dmo').length, 2);
  });

  testWidgets("the server's reason a commitment is refused stays on the form", (tester) async {
    await pumpScreen(tester, const DmoScreen(), {
      '/api/dmo': board(variant: 'sales', level: 'self', me: person()),
      '/api/dmo/weekly': http.Response(jsonEncode({'error': 'Your minimum is 100 doors or 1 claim a week.'}), 400),
    }, height: 2000);
    await tester.tap(find.text('Fill in your weekly DMO'));
    await settle(tester);
    await type(tester, 'Doors', '50');
    await type(tester, 'Claims', '0');
    await tester.tap(find.text('Submit'));
    await settle(tester);
    expect(find.text('Your minimum is 100 doors or 1 claim a week.'), findsOneWidget);
    expect(find.text('Weekly DMO'), findsOneWidget);
  });

  testWidgets("mid-week: bars against the commitment, a Team Lead's change, and the month's goal", (tester) async {
    final me = person(
      chip: const {'state': 'met', 'colour': 'green', 'doorsPace': 42, 'rampDay': null},
      actual: numbers(62, 1, 0, 0),
      weekOf: '2026-11-07',
      thisWeek: commitment('2026-11-07', numbers(150, 2, 1, 15000)),
      weekBars: [bar('doors', 62, 150, 64, 'yellow'), bar('claims', 1, 2, 0, 'green'), bar('contractDollars', 0, 15000, 6428.57, 'red')],
      month: '2026-11',
      plan: {'month': '2026-11', 'incomeGoal': 10000, 'commissionPerRoof': 5000, 'doors': 1200, 'claims': 4, 'contractDollars': 40000},
      income: {'roofsNeeded': 2, 'claimsNeeded': 4, 'weeklyClaims': 0.9},
      monthBars: [bar('doors', 300, 1200, 280, 'green')],
      weeklyState: 'done',
      forWeekOf: '2026-11-14',
      next: commitment('2026-11-14', numbers(150, 1, 0, 0), original: numbers(100, 1, 0, 0), adjustments: [
        {'field': 'doors', 'from': 100, 'to': 150, 'byUserId': 'luke', 'at': '2026-11-13T20:00:00.000Z'},
      ]),
      monthlyState: 'done',
      formMonth: '2026-11',
    );
    await pumpScreen(tester, const DmoScreen(), {
      '/api/dmo': board(variant: 'sales', level: 'self', me: me, names: {'luke': 'Luke Huber'}, weekOf: '2026-11-07'),
    }, height: 2000);

    expect(find.text('Minimum met'), findsOneWidget);
    expect(find.text('Pace for today: 42 doors'), findsNothing);
    expect(find.text('62 / 150 (pace 64)'), findsOneWidget);
    expect(find.text(r'$0 / $15,000 (pace $6,429)'), findsOneWidget);
    expect(find.text('NOVEMBER 2026'), findsOneWidget);
    expect(find.text(r'Income goal $10,000, which needs 2 roofs and 4 claims'), findsOneWidget);
    expect(find.text('300 / 1,200 (pace 280)'), findsOneWidget);
    expect(find.text('Done'), findsOneWidget);
    expect(find.text('100 150 (changed by Luke Huber)'), findsOneWidget);
    expect(find.text('Edit'), findsNWidgets(2)); // the month and next week
    expect(find.text('Fill it in'), findsNothing);
  });

  testWidgets('the monthly DMO works the income calculator and sends the plan', (tester) async {
    final me = person(weeklyState: 'done', next: commitment('2026-10-10', numbers(120, 1, 0, 0)),
        monthlyState: 'due', formMonth: '2026-11');
    await pumpScreen(tester, const DmoScreen(), {
      '/api/dmo': board(variant: 'sales', level: 'self', me: me),
      '/api/dmo/monthly': {'ok': true, 'month': '2026-11'},
    }, height: 2000);
    expect(find.text('Your November 2026 DMO is due before midnight on the 1st.'), findsOneWidget);
    await tester.tap(find.text('Fill it in'));
    await settle(tester);

    expect(find.text('Monthly DMO: November 2026'), findsOneWidget);
    expect(find.widgetWithText(TextField, '5000'), findsOneWidget); // Jay's $5,000 a roof
    await type(tester, 'Monthly income goal', '10000');
    expect(
      find.text(r'$10,000 / $5,000 per roof = 2 roofs. About half of claims become roofs, so you need 4 claims (about 0.9 a week).'),
      findsOneWidget,
    );
    expect(find.widgetWithText(TextField, '4'), findsOneWidget); // claims follow the calculator
    await type(tester, 'Doors this month', '1200');
    await type(tester, r'Contract $ this month', '40000');
    await tester.tap(find.text('Submit'));
    await settle(tester);
    expect(bodyOf('/api/dmo/monthly'),
        {'incomeGoal': 10000, 'commissionPerRoof': 5000, 'doors': 1200, 'claims': 4, 'contractDollars': 40000});
  });

  testWidgets('a Team Lead sees the team, everyone red first, and adjusts a commitment', (tester) async {
    final lead = person(id: 'luke', name: 'Luke Huber', weeklyState: 'done', next: commitment('2026-10-10', numbers(100, 1, 0, 0)));
    final red = person(
      id: 'alan',
      name: 'Alan Bieberle',
      chip: const {'state': 'off-pace', 'colour': 'red', 'doorsPace': 100, 'rampDay': null},
      weeklyState: 'overdue',
    );
    final green = person(
      id: 'trace',
      name: 'Trace Lutteringer',
      chip: const {'state': 'met', 'colour': 'green', 'doorsPace': 100, 'rampDay': null},
      weeklyState: 'done',
      next: commitment('2026-10-10', numbers(100, 1, 0, 0)),
    );
    await pumpScreen(tester, const DmoScreen(), {
      '/api/dmo': board(
        variant: 'sales-team-lead',
        level: 'team',
        me: lead,
        people: [red, green, lead],
        total: groupDmo('Luke Huber', 'Luke Huber', bars: [bar('doors', 300, 450, 450, 'yellow')]),
      ),
      '/api/dmo/adjust': {'ok': true, 'changed': 1},
    }, height: 3600);

    expect(find.text('MY TEAM'), findsOneWidget);
    expect(find.text('Team Luke Huber'), findsOneWidget);
    expect(find.text('3 / 4 green'), findsOneWidget);
    expect(find.text('Weekly DMOs 3 / 5'), findsOneWidget);
    expect(find.text('Monthly 0 / 5'), findsNothing); // nobody owes one before November
    expect(find.text(r'Next week so far (3 sent): 450 doors, 4 claims, 1 contract, $20,000'), findsOneWidget);
    expect(find.text('EVERYONE, RED FIRST'), findsOneWidget);
    expect(find.text('Off pace'), findsOneWidget);
    expect(find.text('Weekly DMO: Not done'), findsOneWidget);
    // Alan sent nothing, and Luke is the viewer: only Trace can be adjusted.
    expect(find.text('Adjust'), findsOneWidget);

    await tester.tap(find.text('Adjust'));
    await settle(tester);
    expect(find.text("Change Trace Lutteringer's numbers for next week. They'll see what they committed and what you changed it to."),
        findsOneWidget);
    await type(tester, 'Doors', '120');
    await tester.tap(find.text('Save'));
    await settle(tester);
    expect(bodyOf('/api/dmo/adjust'), {'userId': 'trace', 'doors': 120, 'claims': 1, 'contracts': 0, 'contractDollars': 0});
  });

  testWidgets('C-level sees the company, what is slipping, and narrows to a branch', (tester) async {
    final fw = person(id: 'a', name: 'Alan Bieberle', branch: 'Fort Worth');
    final dal = person(id: 'c', name: 'Cooper Bledsoe', team: 'Dana Reyes', branch: 'Dallas');
    await pumpScreen(tester, const DmoScreen(), {
      '/api/dmo': board(
        variant: 'c-level',
        level: 'company',
        people: [fw, dal],
        total: groupDmo('company', ''),
        slipping: [
          {...groupDmo('Luke Huber', 'Luke Huber', colour: 'red', green: 1), 'branch': 'Fort Worth', 'branchOwner': 'Gunner McCullough'},
        ],
        groups: [groupDmo('Fort Worth', 'Gunner McCullough'), groupDmo('Dallas', 'Dana Reyes')],
      ),
    }, height: 4200);

    expect(find.text('DMO'), findsOneWidget);
    expect(find.text('Miller Storm'), findsOneWidget);
    expect(find.text('SLIPPING'), findsOneWidget);
    expect(find.text('1 / 4 green. Team Lead: Luke Huber. Branch Manager: Gunner McCullough'), findsOneWidget);
    expect(find.text('BRANCHES'), findsOneWidget);
    expect(find.text('Branch Manager: Gunner McCullough'), findsOneWidget);
    expect(find.text('Adjust'), findsNothing);

    await tester.tap(find.text('Dallas'));
    await tester.pump();
    expect(find.text('DALLAS, RED FIRST'), findsOneWidget);
    expect(find.text('Cooper Bledsoe'), findsOneWidget);
    expect(find.text('Alan Bieberle'), findsNothing);
    await tester.tap(find.text('Show everyone'));
    await tester.pump();
    expect(find.text('Alan Bieberle'), findsOneWidget);
  });

  testWidgets('an account with no DMO of its own says so', (tester) async {
    await pumpScreen(tester, const DmoScreen(), {'/api/dmo': {'variant': 'marketing', 'dmo': null}});
    expect(find.text('The DMO is for the sales team'), findsOneWidget);
    expect(find.text('Your account has no DMO of its own.'), findsOneWidget);
  });

  testWidgets('a failed load says so instead of showing an empty DMO', (tester) async {
    await pumpScreen(tester, const DmoScreen(), {'/api/dmo': http.Response('', 500)});
    expect(find.text('The DMO could not load'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('the menu highlights My DMO while it is open', (tester) async {
    await pumpScreen(tester, const DmoScreen(), {'/api/dmo': board(variant: 'sales', level: 'self', me: person())});
    await tester.tap(find.byTooltip('Open navigation menu'));
    await settle(tester);
    final tile = tester.widget<ListTile>(find.ancestor(of: find.text('My DMO'), matching: find.byType(ListTile)));
    expect(tile.selected, isTrue);
  });

  group('the Dashboard', () {
    final dashboard = {
      'dashboard': {
        'scope': {'level': 'self', 'label': 'You', 'viewer': 'Jose Robles'},
        'hero': {'revenue': 25000, 'contracts': 2, 'year': '2026'},
        'cards': {for (final m in ['revenue', 'contracts', 'claims', 'knocks']) m: {'value': 1, 'top': []}},
        'breakdown': {'kind': 'rep', 'reps': []},
        'training': {'pct': 0, 'headcount': 0, 'top': []},
        'lowestKnocks': null,
      },
    };

    testWidgets('shows one DMO line that opens My DMO', (tester) async {
      await pumpScreen(tester, const Scaffold(body: DashboardView()), {
        '/api/dashboard': dashboard,
        '/api/dmo/status': {
          'line': {'text': 'Your weekly DMO was due Friday at 1 PM.', 'urgent': true, 'href': '/sales/dmo', 'action': 'Open My DMO'},
        },
        '/api/dmo': board(variant: 'sales', level: 'self', me: person()),
      }, height: 2000, appRoutes: {'/dmo': (_) => const DmoScreen()});

      expect(find.text('Your weekly DMO was due Friday at 1 PM.'), findsOneWidget);
      await tester.tap(find.text('Open My DMO'));
      await settle(tester);
      expect(find.text('Your weekly DMO is due Fri 1:00 PM CT.'), findsOneWidget);
    });

    testWidgets('leaves the line out when there is none', (tester) async {
      await pumpScreen(tester, const Scaffold(body: DashboardView()), {
        '/api/dashboard': dashboard,
        '/api/dmo/status': {'line': null},
      }, height: 2000);
      expect(find.text('Open My DMO'), findsNothing);
      expect(find.text('Hi, Jose'), findsOneWidget);
    });
  });
}
