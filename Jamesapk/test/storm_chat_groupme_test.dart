// The phone side of the new Storm Chat (PR #102, GroupMe-style group admins):
// rights come from the server's myRights, Group info's admin tools and Leave,
// mute and @all, older messages and pins in pages, failed sends kept, the poll
// tick, declined join requests and the bell's chat link. The fake server
// answers with the shapes pages/api/storm-chat/* send.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:millerstorm_app/screens/storm_chat_group_info_screen.dart';
import 'package:millerstorm_app/screens/storm_chat_room_screen.dart';
import 'package:millerstorm_app/screens/storm_chat_screen.dart';
import 'package:millerstorm_app/services/storm_chat_logic.dart';
import 'package:millerstorm_app/widgets/notification_bell.dart';

import 'support/long_names_harness.dart';

Future<void> settle(WidgetTester tester, [int ticks = 12]) async {
  for (var i = 0; i < ticks; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

const gid = 'g1';
const msgPath = '/api/storm-chat/messages/$gid';
const groupPath = '/api/storm-chat/groups/$gid';

Map<String, dynamic> msg(String id, String text, {String sender = 'luke', String name = 'Luke Huber', int minute = 0}) => {
      '_id': id,
      'groupId': gid,
      'senderId': sender,
      'senderName': name,
      'message': text,
      'messageType': 'text',
      'createdAt': DateTime.utc(2026, 10, 16, 9).add(Duration(minutes: minute)).toIso8601String(),
    };

Map<String, bool> rights({bool member = true, bool admin = false, bool send = true, bool delete = false}) => {
      'isMember': member,
      'isGroupAdmin': admin,
      'canRead': member || admin,
      'canSend': send,
      'canPin': send,
      'canModerate': admin,
      'canManage': admin,
      'canDelete': delete,
      'canLeave': member,
    };

// Leadership: me, Luke (its admin) and Trace. Members are stored by Mongo _id.
Map<String, dynamic> groupDoc(Map<String, bool> myRights,
        {List<String> admins = const ['m-lead'], bool adminOnly = false, bool muted = false}) =>
    {
      '_id': gid,
      'name': 'Leadership',
      'members': ['m-me', 'm-lead', 'm-trace'],
      'admins': admins,
      'onlyAdminCanChat': adminOnly,
      'createdBy': 'm-lead',
      'myRights': myRights,
      'myMongoId': 'm-me',
      'muted': muted,
      'activeMemberCount': 3,
      'subgroupCount': 0,
    };

const people = [
  {'_id': 'm-me', 'id': 'me', 'name': 'Krupali Patel'},
  {'_id': 'm-lead', 'id': 'luke', 'name': 'Luke Huber'},
  {'_id': 'm-trace', 'id': 'trace', 'name': 'Trace Lutteringer'},
];

// GET /messages/g1 answers the newest page, an older page (?beforeId) or the
// pins (?pinned=1); POST sends.
Object Function(http.Request) messages({
  List<Map<String, dynamic>> page = const [],
  List<Map<String, dynamic>> older = const [],
  List<Map<String, dynamic>> pinned = const [],
  Object Function(http.Request)? onPost,
  http.Response? getReply,
}) =>
    (req) {
      if (req.method == 'POST') return onPost != null ? onPost(req) : http.Response(jsonEncode({'_id': 'new'}), 201);
      if (getReply != null) return getReply;
      final q = req.url.queryParameters;
      if (q['pinned'] == '1') return pinned;
      if (q.containsKey('beforeId')) return older;
      return page;
    };

Map<String, Object> room(Map<String, dynamic> group, Object Function(http.Request) msgs) => {
      groupPath: group,
      msgPath: msgs,
      '/api/users/by-mongo-ids': people,
    };

const roomScreen = StormChatRoomScreen(
  group: {'_id': gid, 'name': 'Leadership', 'members': ['m-me', 'm-lead', 'm-trace'], 'admins': ['m-lead']},
  userId: 'm-me',
  userRole: 'sales',
);

List<http.Request> sent(String method, String path) =>
    sentRequests.where((r) => r.method == method && r.url.path == path).toList();

final hello = [msg('a1', 'Hello from Luke')];

void main() {
  setUpAll(loadRealFonts);

  group('who can type, pin and delete (the server says, not the phone)', () {
    testWidgets('a member can type in a group that has an admin', (tester) async {
      await pumpScreen(tester, roomScreen, room(groupDoc(rights()), messages(page: hello)));
      await settle(tester);
      expect(find.byType(TextField), findsOneWidget);
      expect(find.textContaining('🔒'), findsNothing);
    });

    testWidgets('a group admin can post in an admin-only group', (tester) async {
      await pumpScreen(tester, roomScreen,
          room(groupDoc(rights(admin: true), admins: ['m-me'], adminOnly: true), messages(page: hello)));
      await settle(tester);
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('a member of an admin-only group can read but not post', (tester) async {
      await pumpScreen(tester, roomScreen, room(groupDoc(rights(send: false), adminOnly: true), messages(page: hello)));
      await settle(tester);
      expect(find.text('🔒 Only admins can post in this group\nMembers can read messages'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
    });

    Future<void> openOptions(WidgetTester tester) async {
      await tester.longPress(find.textContaining('Hello from Luke', findRichText: true).first);
      await settle(tester, 4);
      await tester.tap(find.byIcon(Icons.more_horiz).first);
      await settle(tester, 6);
    }

    testWidgets("a group admin may delete someone else's message", (tester) async {
      await pumpScreen(tester, roomScreen, room(groupDoc(rights(admin: true), admins: ['m-me']), messages(page: hello)), height: 1400);
      await settle(tester);
      await openOptions(tester);
      expect(find.text('Delete'), findsOneWidget);
    });

    testWidgets("a member may not delete someone else's message", (tester) async {
      await pumpScreen(tester, roomScreen, room(groupDoc(rights()), messages(page: hello)), height: 1400);
      await settle(tester);
      await openOptions(tester);
      expect(find.text('Delete'), findsNothing);
      expect(find.text('Forward'), findsOneWidget);
    });
  });

  group('@all', () {
    Future<void> typeAt(WidgetTester tester) async {
      await tester.enterText(find.byType(TextField), '@');
      await settle(tester, 3);
    }

    testWidgets('is offered to a group admin', (tester) async {
      await pumpScreen(tester, roomScreen, room(groupDoc(rights(admin: true), admins: ['m-me']), messages(page: hello)));
      await settle(tester);
      await typeAt(tester);
      expect(find.text('@all'), findsOneWidget);
      expect(find.text('Notify everyone in this group'), findsOneWidget);
    });

    testWidgets('is not offered to a member', (tester) async {
      await pumpScreen(tester, roomScreen, room(groupDoc(rights()), messages(page: hello)));
      await settle(tester);
      await typeAt(tester);
      expect(find.text('@all'), findsNothing);
      expect(find.text('Luke Huber'), findsWidgets);
    });
  });

  group('history in pages', () {
    final fullPage = [for (var i = 0; i < 100; i++) msg('p$i', 'Message $i', minute: 10 + i)];

    testWidgets('scrolling up loads the page before the oldest message', (tester) async {
      await pumpScreen(
          tester,
          roomScreen,
          room(groupDoc(rights()),
              messages(page: fullPage, older: [msg('o1', 'The very first message', minute: 1)])),
          height: 1400);
      await settle(tester);
      // The newest page (?limit=100), not the old 500.
      expect(sent('GET', msgPath).first.url.queryParameters['limit'], '100');
      expect(find.textContaining('Message 99', findRichText: true), findsWidgets);

      await tester.drag(find.byType(CustomScrollView), const Offset(0, 30000));
      await settle(tester);
      final olderAsk = sent('GET', msgPath).where((r) => r.url.queryParameters.containsKey('beforeId')).toList();
      expect(olderAsk, isNotEmpty);
      expect(olderAsk.first.url.queryParameters['beforeId'], 'p0');
      await tester.drag(find.byType(CustomScrollView), const Offset(0, 30000));
      await settle(tester);
      expect(find.textContaining('The very first message', findRichText: true), findsWidgets);
    });

    testWidgets('the pinned banner shows pins older than the loaded page', (tester) async {
      await pumpScreen(
          tester,
          roomScreen,
          room(
              groupDoc(rights()),
              messages(page: hello, pinned: [
                {...msg('old', 'Office closes at 5 on Fridays', name: 'Jay Miller'), 'pinned': true},
              ])));
      await settle(tester);
      expect(find.text('Jay Miller: Office closes at 5 on Fridays'), findsOneWidget);
    });
  });

  group('sending keeps what was typed until the server accepts it', () {
    Future<void> send(WidgetTester tester, String text) async {
      await tester.enterText(find.byType(TextField), text);
      await tester.pump(); // the 🎤 turns into Send once there's text
      await tester.tap(find.byIcon(Icons.send));
      await settle(tester);
    }

    String box(WidgetTester tester) => tester.widget<TextField>(find.byType(TextField)).controller!.text;

    testWidgets('a message over 2,000 characters is refused before sending, and kept', (tester) async {
      await pumpScreen(tester, roomScreen, room(groupDoc(rights()), messages(page: hello)));
      await settle(tester);
      await send(tester, 'a' * 2001);
      expect(find.text(kTooLongMessage), findsOneWidget);
      expect(sent('POST', msgPath), isEmpty);
      expect(box(tester).length, 2001);
    });

    testWidgets("a refused message stays in the box with the server's reason", (tester) async {
      const slowDown = 'Slow down: too many messages at once. Try again in a few seconds.';
      await pumpScreen(
          tester,
          roomScreen,
          room(groupDoc(rights()),
              messages(page: hello, onPost: (_) => http.Response(jsonEncode({'error': slowDown}), 429))));
      await settle(tester);
      await send(tester, 'hello team');
      expect(find.text(slowDown), findsOneWidget);
      expect(box(tester), 'hello team');
    });

    testWidgets('an accepted message clears the box', (tester) async {
      await pumpScreen(tester, roomScreen, room(groupDoc(rights()), messages(page: hello)));
      await settle(tester);
      await send(tester, 'hello team');
      expect(jsonDecode(sent('POST', msgPath).single.body)['message'], 'hello team');
      expect(box(tester), '');
    });

    testWidgets("a refused poll says why instead of disappearing", (tester) async {
      await pumpScreen(
          tester,
          roomScreen,
          room(
              groupDoc(rights()),
              messages(
                  page: hello,
                  onPost: (_) => http.Response(jsonEncode({'error': 'Poll options can be up to 100 characters'}), 400))));
      await settle(tester);
      await tester.tap(find.byIcon(Icons.attach_file));
      await settle(tester, 6);
      await tester.tap(find.text('Create Poll'));
      await settle(tester, 6);
      final fields = find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField));
      await tester.enterText(fields.at(0), 'Lunch?');
      await tester.enterText(fields.at(1), 'Pizza');
      await tester.enterText(fields.at(2), 'Tacos');
      await tester.tap(find.text('Send'));
      await settle(tester);
      expect(find.text('Poll options can be up to 100 characters'), findsOneWidget);
    });
  });

  testWidgets('my poll vote shows its tick (votes are stored under the app id)', (tester) async {
    final poll = {
      ...msg('poll1', 'Lunch?'),
      'messageType': 'poll',
      'poll': {
        'question': 'Lunch?',
        'allowMultiple': false,
        'options': [
          {'text': 'Pizza', 'votes': ['me']},
          {'text': 'Tacos', 'votes': []},
        ],
      },
    };
    await pumpScreen(tester, roomScreen, room(groupDoc(rights()), messages(page: [poll])));
    await settle(tester);
    expect(find.text('✓ Pizza'), findsOneWidget);
    expect(find.text('Tacos'), findsOneWidget);
    expect(find.textContaining('1 of 3 voted'), findsOneWidget);
  });

  testWidgets('removed from the chat while it is open: one notice, and no more refreshing', (tester) async {
    await pumpScreen(
        tester,
        roomScreen,
        room(groupDoc(rights()),
            messages(getReply: http.Response(jsonEncode({'error': 'You are not a member of this group'}), 403))));
    await settle(tester);
    expect(find.text('You are not a member of this group'), findsOneWidget);
    await settle(tester, 100); // 10 more seconds: three refreshes would have run
    expect(sent('GET', msgPath).where((r) => r.url.queryParameters['pinned'] != '1').length, 1);
  });

  group('Group info', () {
    // Opens Group info from a page that records how it closed ('gone' = left).
    Future<List<String?>> pumpInfo(WidgetTester tester, Map<String, Object> routes) async {
      final results = <String?>[];
      await pumpScreen(
        tester,
        Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () async {
                  results.add(await Navigator.push<String>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const StormChatGroupInfoScreen(
                        group: {'_id': gid, 'name': 'Leadership'},
                        userId: 'm-me',
                        userRole: 'sales',
                      ),
                    ),
                  ));
                },
                child: const Text('open'),
              ),
            ),
          ),
        ),
        routes,
        height: 1800,
      );
      await tester.tap(find.text('open'));
      await settle(tester);
      return results;
    }

    testWidgets("a member sees mute and Leave, but none of the admin tools", (tester) async {
      await pumpInfo(tester, room(groupDoc(rights()), messages()));
      expect(find.text('Mute this group'), findsOneWidget);
      expect(find.text('Leave group'), findsOneWidget);
      expect(find.text('Edit name and description'), findsNothing);
      expect(find.text('Only admins can post'), findsNothing);
      expect(find.text('Add'), findsNothing);
      expect(find.text('Delete group for everyone'), findsNothing);
      expect(find.text('Krupali Patel (you)'), findsOneWidget);
    });

    testWidgets("a group admin gets the tools; the creator can delete", (tester) async {
      await pumpInfo(tester, room(groupDoc(rights(admin: true, delete: true), admins: ['m-me']), messages()));
      expect(find.text('Edit name and description'), findsOneWidget);
      expect(find.text('Only admins can post'), findsOneWidget);
      expect(find.text('Add'), findsOneWidget);
      expect(find.byTooltip('Manage Luke Huber'), findsOneWidget);
      expect(find.byTooltip('Manage Krupali Patel'), findsNothing); // your own row: use Leave
      expect(find.text('Delete group for everyone'), findsOneWidget);
    });

    testWidgets('mute asks for how long and sends the choice to the server', (tester) async {
      await pumpInfo(tester, {
        ...room(groupDoc(rights()), messages()),
        '$groupPath/mute': {'muted': true, 'mutedUntil': '2026-10-17T21:30:00.000Z'},
      });
      await tester.tap(find.text('Mute this group'));
      await settle(tester, 6);
      await tester.tap(find.text('For 1 hour'));
      await settle(tester);
      expect(jsonDecode(sent('POST', '$groupPath/mute').single.body), {'muted': true, 'for': '1h'});
      expect(find.textContaining('Muted until'), findsWidgets);
    });

    testWidgets('the last admin picks a successor, then leaves', (tester) async {
      var calls = 0;
      final results = await pumpInfo(tester, {
        ...room(groupDoc(rights(admin: true), admins: ['m-me']), messages()),
        '$groupPath/leave': (http.Request req) => ++calls == 1
            ? http.Response(jsonEncode({'error': 'You are the last admin', 'needsNewAdmin': true}), 409)
            : {'ok': true},
      });
      await tester.tap(find.text('Leave group'));
      await settle(tester, 6);
      await tester.tap(find.text('Leave'));
      await settle(tester);
      expect(find.textContaining("You're the last admin"), findsOneWidget);
      await tester.tap(find.text('Trace Lutteringer').last);
      await settle(tester);
      final leaves = sent('POST', '$groupPath/leave');
      expect(leaves.length, 2);
      expect(jsonDecode(leaves.last.body), {'newAdminId': 'm-trace'});
      expect(results, ['gone']);
    });

    testWidgets("making someone admin while group admins are switched off says so", (tester) async {
      await pumpInfo(tester, {
        // The server keeps the old admin list (GROUP_ADMINS_ENABLED off).
        groupPath: (http.Request req) => req.method == 'PUT' ? {'ok': true} : groupDoc(rights(admin: true), admins: ['m-me']),
        msgPath: messages(),
        '/api/users/by-mongo-ids': people,
      });
      await tester.tap(find.byTooltip('Manage Trace Lutteringer'));
      await settle(tester, 6);
      await tester.tap(find.text('Make admin'));
      await settle(tester);
      expect(jsonDecode(sent('PUT', groupPath).single.body)['admins'], ['m-me', 'm-trace']);
      expect(find.text("Group admins aren't switched on yet, so Trace Lutteringer wasn't made admin."), findsOneWidget);
    });

    testWidgets('an admin approves a request to join', (tester) async {
      await pumpInfo(tester, {
        ...room(groupDoc(rights(admin: true), admins: ['m-me']), messages()),
        '/api/storm-chat/join-requests': (http.Request req) => req.method == 'PATCH'
            ? {'ok': true, 'status': 'approved'}
            : [
                {'_id': 'r1', 'userName': 'Maria Lopez'}
              ],
      });
      expect(find.text('Requests to join (1)'.toUpperCase()), findsOneWidget);
      await tester.tap(find.text('Approve'));
      await settle(tester);
      expect(jsonDecode(sent('PATCH', '/api/storm-chat/join-requests').single.body), {'requestId': 'r1', 'action': 'approve'});
    });
  });

  group('the chat list', () {
    Map<String, Object> list(List<Map<String, dynamic>> groups, {Object? join}) => {
          '/api/storm-chat/groups': groups,
          '/api/storm-chat/unread-counts': <String, int>{},
          '/api/storm-chat/mention-counts': <String, int>{},
          if (join != null) '/api/storm-chat/join-requests': join,
        };

    testWidgets('a declined request can be asked again: the server decides when', (tester) async {
      await pumpScreen(
        tester,
        const StormChatScreen(),
        list([
          {'_id': 'p1', 'name': 'Managers Only', 'isMember': false, 'joinStatus': 'denied', 'memberCount': 12},
        ], join: http.Response(jsonEncode({'error': 'denied', 'message': 'Your request was declined. You can ask again in 3 days.'}), 403)),
      );
      await settle(tester);
      await tester.tap(find.text('Managers Only'));
      await settle(tester);
      expect(sent('POST', '/api/storm-chat/join-requests'), hasLength(1));
      expect(find.text('Your request was declined. You can ask again in 3 days.'), findsOneWidget);
    });

    testWidgets('muted chats show a bell-off', (tester) async {
      await pumpScreen(
        tester,
        const StormChatScreen(),
        list([
          {'_id': 'g1', 'name': 'Leadership', 'isMember': true, 'isMuted': true, 'members': ['m-me']},
        ]),
      );
      await settle(tester);
      expect(find.byIcon(Icons.notifications_off), findsOneWidget);
    });
  });

  testWidgets("the bell's chat alert opens that chat", (tester) async {
    await pumpScreen(
      tester,
      Scaffold(appBar: AppBar(actions: const [NotificationBell(userId: 'me')])),
      {
        ...room(groupDoc(rights()), messages(page: hello)),
        '/api/notifications': [
          {
            'id': 'n1',
            'userId': 'me',
            'type': 'stormchat_message',
            'title': 'New message in Leadership',
            'message': 'Luke Huber: Hello from Luke',
            'read': false,
            'createdAt': '2026-10-16T09:00:00.000Z',
            'metadata': {'groupId': gid, 'groupName': 'Leadership'},
          },
        ],
      },
    );
    await settle(tester);
    await tester.tap(find.text('🔔'));
    await settle(tester);
    await tester.tap(find.text('New message in Leadership'));
    await settle(tester);
    final chatLoads = sentRequests.where((r) => r.method == 'GET' && r.url.path.startsWith('/api/storm-chat/messages/'));
    expect(chatLoads.map((r) => r.url.path).toSet(), {msgPath}); // never /messages/null
    expect(find.textContaining('Hello from Luke', findRichText: true), findsWidgets);
  });
}
