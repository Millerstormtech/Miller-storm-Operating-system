// Storm Chat on the phone, GroupMe-parity batches 1 and 2 (PRs #105, #106):
// edit within 15 minutes, "This message was deleted", search, the chat-list
// preview, timed mute, the gallery, albums, voice messages, locations and
// polls with an end time / voters / anonymous. The fake server answers with
// the shapes pages/api/storm-chat/* send.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:millerstorm_app/screens/storm_chat_group_info_screen.dart';
import 'package:millerstorm_app/screens/storm_chat_screen.dart';
import 'package:millerstorm_app/services/storm_chat_logic.dart';

import 'storm_chat_groupme_test.dart' as g;
import 'support/long_names_harness.dart';

final settle = g.settle;
const msgPath = g.msgPath;

// A message I sent (the stored user's app id is 'me') [minutesAgo] ago.
Map<String, dynamic> mine(String id, String text, {int minutesAgo = 5}) => {
      ...g.msg(id, text, sender: 'me', name: 'Krupali Patel'),
      'createdAt': DateTime.now().toUtc().subtract(Duration(minutes: minutesAgo)).toIso8601String(),
    };

Future<void> openOptions(WidgetTester tester, String text) async {
  await tester.longPress(find.textContaining(text, findRichText: true).first);
  await settle(tester, 4);
  await tester.tap(find.byIcon(Icons.more_horiz).first);
  await settle(tester, 6);
}

void main() {
  setUpAll(loadRealFonts);

  group('the rules the phone repeats', () {
    test('edit: my own text, for 15 minutes', () {
      final me = {'me', 'm-me'};
      expect(canEditMessage(mine('a', 'hi', minutesAgo: 14), me), isTrue);
      expect(canEditMessage(mine('a', 'hi', minutesAgo: 16), me), isFalse);
      expect(canEditMessage(g.msg('b', 'not mine'), me), isFalse);
      expect(canEditMessage({...mine('c', '🎤'), 'messageType': 'file', 'voice': {'durationSec': 4}}, me), isFalse);
      expect(canEditMessage({...mine('d', 'x'), 'deletedAt': '2026-10-16T10:00:00Z'}, me), isFalse);
    });

    test('times read in Central, like the website', () {
      final now = DateTime.utc(2026, 10, 17, 15); // 10:00 AM CDT
      expect(centralWhenLabel('2026-10-17T21:30:00.000Z', now: now), '4:30 PM');
      expect(centralWhenLabel('2026-10-18T15:00:00.000Z', now: now), 'Sun 10:00 AM');
      expect(formatDuration(65), '1:05');
    });
  });

  group('edit and delete', () {
    testWidgets('my message can be edited for 15 minutes and then shows "edited"', (tester) async {
      var current = mine('m1', 'Meet at 7');
      await pumpScreen(
          tester,
          g.roomScreen,
          g.room(g.groupDoc(g.rights()), (http.Request req) {
            // The server remembers the edit, so later refreshes show it too.
            if (req.method == 'PATCH') current = {...mine('m1', 'Meet at 8'), 'editedAt': '2026-10-17T15:00:00.000Z'};
            return req.method == 'PATCH' ? current : g.messages(page: [current])(req);
          }),
          height: 1400);
      await settle(tester);
      await openOptions(tester, 'Meet at 7');
      await tester.tap(find.text('Edit'));
      await settle(tester, 4);
      expect(find.text('Editing message'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Meet at 8');
      await tester.pump();
      await tester.tap(find.byTooltip('Save edit'));
      await settle(tester);
      final patch = sentRequests.where((r) => r.method == 'PATCH').single;
      expect(jsonDecode(patch.body), {'action': 'edit', 'messageId': 'm1', 'message': 'Meet at 8'});
      expect(find.textContaining('Meet at 8', findRichText: true), findsWidgets);
      expect(find.textContaining('edited ·'), findsOneWidget);
      expect(find.text('Editing message'), findsNothing);
    });

    testWidgets('an older message is not offered for editing', (tester) async {
      await pumpScreen(tester, g.roomScreen, g.room(g.groupDoc(g.rights()), g.messages(page: [mine('m1', 'Old one', minutesAgo: 30)])),
          height: 1400);
      await settle(tester);
      await openOptions(tester, 'Old one');
      expect(find.text('Edit'), findsNothing);
      expect(find.text('Delete'), findsOneWidget);
    });

    testWidgets('a deleted message stays as a notice nobody can react to', (tester) async {
      final notice = {...g.msg('d1', kDeletedText), 'deletedAt': '2026-10-17T10:00:00.000Z'};
      await pumpScreen(tester, g.roomScreen, g.room(g.groupDoc(g.rights()), g.messages(page: [notice])), height: 1400);
      await settle(tester);
      expect(find.text('🚫 $kDeletedText'), findsOneWidget);
      await tester.longPress(find.text('🚫 $kDeletedText'));
      await settle(tester, 4);
      expect(find.byIcon(Icons.more_horiz), findsNothing); // no emoji tray, no menu
    });

    testWidgets('deleting my message leaves "This message was deleted"', (tester) async {
      var current = mine('m1', 'Wrong chat, sorry');
      await pumpScreen(
          tester,
          g.roomScreen,
          g.room(g.groupDoc(g.rights()), (http.Request req) {
            if (req.method == 'DELETE') {
              current = {...mine('m1', kDeletedText), 'deletedAt': '2026-10-17T10:00:00.000Z'};
              return {'success': true, 'message': current};
            }
            return g.messages(page: [current])(req);
          }),
          height: 1400);
      await settle(tester);
      await openOptions(tester, 'Wrong chat');
      await tester.tap(find.text('Delete'));
      await settle(tester, 4);
      await tester.tap(find.widgetWithText(TextButton, 'Delete'));
      await settle(tester);
      expect(jsonDecode(sentRequests.where((r) => r.method == 'DELETE').single.body), {'messageId': 'm1'});
      expect(find.text('🚫 $kDeletedText'), findsOneWidget);
    });
  });

  group('albums, voice and locations', () {
    final album = [
      for (var i = 0; i < 3; i++)
        {...g.msg('p$i', '', minute: i), 'messageType': 'image', 'mediaUrl': '/uploads/p$i.jpg', 'albumId': 'alb1'},
    ];

    testWidgets('photos sent together show once, as one grid, and delete together', (tester) async {
      await pumpScreen(
          tester,
          g.roomScreen,
          g.room(g.groupDoc(g.rights(admin: true), admins: ['m-me']),
              (http.Request req) => req.method == 'DELETE' ? {'success': true} : g.messages(page: album)(req)),
          height: 1400);
      await settle(tester);
      expect(find.byType(GridView), findsOneWidget);
      expect(find.descendant(of: find.byType(GridView), matching: find.byType(GestureDetector)), findsNWidgets(3));
      // Long-press the grid to delete it.
      await tester.longPress(find.byType(GridView));
      await settle(tester, 4);
      await tester.tap(find.byIcon(Icons.more_horiz).first);
      await settle(tester, 6);
      await tester.tap(find.text('Delete'));
      await settle(tester, 4);
      expect(find.text('Delete these 3 photos?'), findsOneWidget);
      await tester.tap(find.widgetWithText(TextButton, 'Delete'));
      await settle(tester);
      expect(sentRequests.where((r) => r.method == 'DELETE'), hasLength(3));
    });

    testWidgets('a voice message plays in the chat, with its length', (tester) async {
      final voice = {
        ...g.msg('v1', '🎤 Voice message (1:05)'),
        'messageType': 'file',
        'mediaUrl': '/uploads/v1.m4a',
        'voice': {'durationSec': 65},
      };
      await pumpScreen(tester, g.roomScreen, g.room(g.groupDoc(g.rights()), g.messages(page: [voice])));
      await settle(tester);
      expect(find.byTooltip('Play voice message'), findsOneWidget);
      expect(find.text('🎤 1:05'), findsOneWidget);
    });

    testWidgets('a shared location opens in Maps', (tester) async {
      final loc = {
        ...g.msg('l1', '📍 Location: https://www.google.com/maps?q=32.7555,-97.3308'),
        'location': {'lat': 32.7555, 'lng': -97.3308},
      };
      await pumpScreen(tester, g.roomScreen, g.room(g.groupDoc(g.rights()), g.messages(page: [loc])));
      await settle(tester);
      expect(find.text('Shared location'), findsOneWidget);
      expect(find.text('Open in Maps'), findsOneWidget);
    });

    testWidgets('an empty box offers a voice message; typing turns it into Send', (tester) async {
      await pumpScreen(tester, g.roomScreen, g.room(g.groupDoc(g.rights()), g.messages(page: g.hello)));
      await settle(tester);
      expect(find.byTooltip('Record a voice message'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'hi');
      await tester.pump();
      expect(find.byTooltip('Send'), findsOneWidget);
    });
  });

  group('polls', () {
    Map<String, dynamic> poll({String? endsAt, bool anonymous = false, List<String> pizzaVoters = const ['Luke Huber']}) => {
          ...g.msg('poll1', 'Lunch?'),
          'messageType': 'poll',
          'poll': {
            'question': 'Lunch?',
            'allowMultiple': false,
            'anonymous': anonymous,
            if (endsAt != null) 'endsAt': endsAt,
            'voterCount': 1,
            'options': [
              {'text': 'Pizza', 'votes': ['luke'], if (!anonymous) 'voterNames': pizzaVoters},
              {'text': 'Tacos', 'votes': [], if (!anonymous) 'voterNames': []},
            ],
          },
        };

    testWidgets('an ended poll says so and takes no more votes; See votes lists names', (tester) async {
      await pumpScreen(tester, g.roomScreen, g.room(g.groupDoc(g.rights()), g.messages(page: [poll(endsAt: '2026-01-01T00:00:00Z')])),
          height: 1400);
      await settle(tester);
      expect(find.text('Poll ended'), findsOneWidget);
      await tester.tap(find.text('Tacos'));
      await settle(tester);
      expect(sentRequests.where((r) => r.url.path == '/api/storm-chat/poll-vote'), isEmpty);
      await tester.tap(find.text('See votes'));
      await settle(tester, 6);
      expect(find.text('Luke Huber'), findsWidgets);
    });

    testWidgets('an anonymous poll hides who voted', (tester) async {
      await pumpScreen(tester, g.roomScreen, g.room(g.groupDoc(g.rights()), g.messages(page: [poll(anonymous: true)])), height: 1400);
      await settle(tester);
      expect(find.textContaining('🔒 Anonymous'), findsOneWidget);
      expect(find.text('See votes'), findsNothing);
    });

    testWidgets('a new poll can end on its own and be anonymous', (tester) async {
      await pumpScreen(tester, g.roomScreen, g.room(g.groupDoc(g.rights()), g.messages(page: g.hello)));
      await settle(tester);
      await tester.tap(find.byIcon(Icons.attach_file));
      await settle(tester, 6);
      await tester.tap(find.text('Create Poll'));
      await settle(tester, 6);
      final fields = find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField));
      await tester.enterText(fields.at(0), 'Lunch?');
      await tester.enterText(fields.at(1), 'Pizza');
      await tester.enterText(fields.at(2), 'Tacos');
      await tester.tap(find.text('Anonymous voting'));
      await tester.tap(find.text('No end'));
      await settle(tester, 6);
      await tester.tap(find.text('In 1 day').last);
      await settle(tester, 6);
      await tester.tap(find.text('Send'));
      await settle(tester);
      final sentPoll = jsonDecode(sentRequests.where((r) => r.method == 'POST' && r.url.path == msgPath).single.body)['poll'];
      expect(sentPoll['anonymous'], isTrue);
      final ends = DateTime.parse(sentPoll['endsAt']);
      expect(ends.difference(DateTime.now()).inHours, inInclusiveRange(23, 24));
    });
  });

  group('search', () {
    testWidgets("searching this chat jumps to an older message, loading back to it", (tester) async {
      final older = [g.msg('old1', 'New invoice process starts Monday', name: 'Jay Miller', minute: 1)];
      final page = [for (var i = 0; i < 100; i++) g.msg('p$i', 'Message $i', minute: 10 + i)];
      await pumpScreen(tester, g.roomScreen, {
        ...g.room(g.groupDoc(g.rights()), g.messages(page: page, older: older)),
        '/api/storm-chat/search': [
          {
            '_id': 'old1',
            'groupId': 'g1',
            'chatName': 'Leadership',
            'senderName': 'Jay Miller',
            'snippet': 'New invoice process starts Monday',
            'createdAt': '2026-10-16T09:01:00.000Z',
          },
        ],
      }, height: 1400);
      await settle(tester);
      await tester.tap(find.byTooltip('Search this chat'));
      await settle(tester, 6);
      await tester.enterText(find.byType(TextField), 'invoice');
      await settle(tester, 6);
      expect(sentRequests.where((r) => r.url.path == '/api/storm-chat/search').last.url.queryParameters,
          {'q': 'invoice', 'groupId': 'g1'});
      await tester.tap(find.text('Jay Miller'));
      await settle(tester, 20);
      expect(sentRequests.where((r) => r.url.queryParameters['beforeId'] == 'p0'), isNotEmpty);
      expect(find.textContaining('New invoice process', findRichText: true), findsWidgets);
    });
  });

  group('the chat list', () {
    Map<String, Object> list(List<Map<String, dynamic>> groups, {Map<String, int> unread = const {}}) => {
          '/api/storm-chat/groups': groups,
          '/api/storm-chat/unread-counts': unread,
          '/api/storm-chat/mention-counts': <String, int>{},
        };

    testWidgets("shows each chat's newest message, unread chats in bold", (tester) async {
      await pumpScreen(
        tester,
        const StormChatScreen(),
        list([
          {'_id': 'g1', 'name': 'Leadership', 'isMember': true, 'members': ['m-me'], 'lastMessagePreview': 'Luke Huber: meet at 7'},
          {'_id': 'g2', 'name': 'Fort Worth', 'isMember': true, 'members': ['m-me'], 'lastMessagePreview': 'You: done'},
        ], unread: {'g1': 2}),
      );
      await settle(tester);
      expect(find.text('Luke Huber: meet at 7'), findsOneWidget);
      expect(find.text('You: done'), findsOneWidget);
      FontWeight? weight(String name) => tester.widget<Text>(find.text(name)).style?.fontWeight;
      expect(weight('Leadership'), FontWeight.w800);
      expect(weight('Fort Worth'), FontWeight.w600);
    });

    testWidgets('searching every chat opens a result at that message', (tester) async {
      await pumpScreen(tester, const StormChatScreen(), {
        ...list([
          {'_id': 'g1', 'name': 'Leadership', 'isMember': true, 'members': ['m-me']},
        ]),
        '/api/storm-chat/search': [
          {'_id': 'a1', 'groupId': 'g1', 'chatName': 'Leadership', 'senderName': 'Luke Huber', 'snippet': 'Hello from Luke', 'createdAt': '2026-10-16T09:00:00.000Z'},
        ],
        ...g.room(g.groupDoc(g.rights()), g.messages(page: g.hello)),
      });
      await settle(tester);
      await tester.tap(find.byTooltip('Search messages'));
      await settle(tester, 6);
      await tester.enterText(find.byType(TextField), 'hello');
      await settle(tester, 6);
      expect(sentRequests.where((r) => r.url.path == '/api/storm-chat/search').last.url.queryParameters, {'q': 'hello'});
      await tester.tap(find.text('Leadership').last);
      await settle(tester);
      expect(sentRequests.where((r) => r.url.path == msgPath), isNotEmpty);
      expect(find.textContaining('Hello from Luke', findRichText: true), findsWidgets);
    });
  });

  group('Group info', () {
    Future<void> pumpInfo(WidgetTester tester, Map<String, Object> routes) async {
      await pumpScreen(
        tester,
        const StormChatGroupInfoScreen(group: {'_id': 'g1', 'name': 'Leadership'}, userId: 'm-me', userRole: 'sales'),
        routes,
        height: 1800,
      );
      await settle(tester);
    }

    testWidgets('says until when a chat is muted', (tester) async {
      await pumpInfo(tester, g.room({...g.groupDoc(g.rights(), muted: true), 'mutedUntil': '2026-10-18T15:00:00.000Z'}, g.messages()));
      expect(find.textContaining('Muted until Sun 10:00 AM'), findsOneWidget);
    });

    testWidgets("the gallery comes from the server, a tab at a time, with more on request", (tester) async {
      final photos = [
        for (var i = 0; i < 60; i++) {'_id': 'ph$i', 'messageType': 'image', 'mediaUrl': '/uploads/$i.jpg', 'senderName': 'Luke Huber'},
      ];
      await pumpInfo(
          tester,
          g.room(g.groupDoc(g.rights()), (http.Request req) {
            final kind = req.url.queryParameters['media'];
            if (kind == 'photos') return req.url.queryParameters.containsKey('beforeId') ? <Object>[] : photos;
            if (kind == 'links') {
              return [
                {'_id': 'l1', 'messageType': 'text', 'message': 'See https://acculynx.com and https://millerstorm.tech/x.', 'senderName': 'Jay Miller'},
              ];
            }
            return <Object>[];
          }));
      final asked = () => sentRequests.where((r) => r.url.path == msgPath).map((r) => r.url.queryParameters).toList();
      expect(asked().first, {'media': 'photos'});
      await tester.ensureVisible(find.text('Load more'));
      await settle(tester, 3);
      await tester.tap(find.text('Load more'));
      await settle(tester);
      expect(asked().last, {'media': 'photos', 'beforeId': 'ph59'});
      await tester.ensureVisible(find.text('Links'));
      await settle(tester, 3);
      await tester.tap(find.text('Links'));
      await settle(tester);
      expect(asked().last, {'media': 'links'});
      expect(find.text('https://acculynx.com'), findsOneWidget);
      expect(find.text('https://millerstorm.tech/x'), findsOneWidget);
    });
  });
}
