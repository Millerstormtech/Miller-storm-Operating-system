// The keyboard's key in a chat box is Return: it starts a new line and never
// sends. Only the red send button sends (requested 2026-10-13).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:millerstorm_app/screens/storm_chat_room_screen.dart';

import 'support/long_names_harness.dart';

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

int posts(String path) => sentRequests.where((r) => r.method == 'POST' && r.url.path == path).length;

void main() {
  setUpAll(loadRealFonts);

  testWidgets('Storm Chat: Return adds a line, the send button sends', (tester) async {
    const path = '/api/storm-chat/messages/g1';
    await pumpScreen(
      tester,
      const StormChatRoomScreen(
        group: {'_id': 'g1', 'name': 'Leadership', 'members': ['me']},
        userId: 'me',
        userRole: 'sales',
      ),
      {path: []},
    );

    final box = find.byType(TextField);
    expect(tester.widget<TextField>(box).textInputAction, TextInputAction.newline);

    await tester.enterText(box, 'test test');
    await tester.testTextInput.receiveAction(TextInputAction.newline);
    await settle(tester);
    expect(posts(path), 0, reason: 'the keyboard key must not send');

    await tester.tap(find.byIcon(Icons.send));
    await settle(tester);
    expect(posts(path), 1);
  });

  // What the phone's own keyboard is told, on Android and on iPhone: a
  // multi-line box whose key is Return/Enter. (Android maps it to
  // IME_ACTION_NONE on a multi-line field: the keyboard's Enter key; Send was
  // IME_ACTION_SEND.)
  testWidgets('Storm Chat asks the phone keyboard for Return, not Send', (tester) async {
    const path = '/api/storm-chat/messages/g1';
    await pumpScreen(
      tester,
      const StormChatRoomScreen(
        group: {'_id': 'g1', 'name': 'Leadership', 'members': ['me']},
        userId: 'me',
        userRole: 'sales',
      ),
      {path: []},
    );
    await tester.showKeyboard(find.byType(TextField));
    final config = tester.testTextInput.setClientArgs!;
    expect(config['inputAction'], 'TextInputAction.newline');
    expect((config['inputType'] as Map)['name'], 'TextInputType.multiline');
  }, variant: const TargetPlatformVariant({TargetPlatform.android, TargetPlatform.iOS}));
}
