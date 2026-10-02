// Shared by the long-name tests: opens a real screen on a phone-sized display
// with the app's API answered by canned responses, and checks that text
// containing a long name was not cut off with "...".
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:millerstorm_app/theme/app_theme.dart';

const longName = 'Maximilian Alexander Montgomery-Fitzgerald';
const longName2 = 'Bartholomew Christopher Vanderbilt-Rosenberg';
const longKing = 'Konstantinos Papadopoulos-Hendrickson Junior';
const longEmail = 'maximilian.montgomery-fitzgerald@millerstormroofing.com';
const longTeam = 'Hendrickson Storm Restoration Crew';
const longGroup = 'Dallas–Fort Worth Storm Response Coordination Group';
const longTool = 'AccuLynx Supplement Estimator & Insurance Scope Builder';

/// Flutter tests draw every glyph as a full-width box, so text measures about
/// twice as wide as on a phone. Load Roboto (what the app's "sans-serif" is on
/// Android) from the Flutter SDK so wrapping and overflow match a real device.
Future<void> loadRealFonts() async {
  final root = Platform.environment['FLUTTER_ROOT'] ??
      File(Platform.resolvedExecutable).parent.parent.parent.parent.parent.parent.path;
  final dir = '$root/bin/cache/artifacts/material_fonts';
  Future<ByteData> font(String f) async => ByteData.sublistView(await File('$dir/$f').readAsBytes());
  for (final family in ['sans-serif', 'Roboto']) {
    final loader = FontLoader(family);
    for (final f in ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Bold.ttf', 'Roboto-Black.ttf', 'Roboto-Light.ttf', 'Roboto-Italic.ttf']) {
      loader.addFont(font(f));
    }
    await loader.load();
  }
  final icons = FontLoader('MaterialIcons')..addFont(font('MaterialIcons-Regular.otf'));
  await icons.load();
}

/// Every piece of text on screen.
List<RenderParagraph> allParagraphs(WidgetTester tester) {
  final found = <RenderParagraph>[];
  void visit(RenderObject o) {
    if (o is RenderParagraph) found.add(o);
    o.visitChildren(visit);
  }
  for (final view in tester.binding.renderViews) {
    visit(view);
  }
  return found;
}

/// Every on-screen paragraph whose text contains [needle].
List<RenderParagraph> paragraphsContaining(WidgetTester tester, String needle) =>
    allParagraphs(tester).where((p) => p.text.toPlainText().contains(needle)).toList();

/// Fails if any text containing one of [names] was shortened.
void expectShownInFull(WidgetTester tester, List<String> names) {
  for (final name in names) {
    final ps = paragraphsContaining(tester, name);
    if (ps.isEmpty) {
      final shown = allParagraphs(tester).map((p) => p.text.toPlainText());
      fail('"$name" is not on screen at all. On screen: ${shown.take(40).join(' | ')}');
    }
    for (final p in ps) {
      expect(p.didExceedMaxLines, isFalse,
          reason: 'cut off with "...": "${p.text.toPlainText()}"');
    }
  }
}

// The app creates its API client once and keeps it, so a single fake server
// answers every test, from whichever routes the current test set.
Map<String, Object> _routes = {};
final _client = MockClient((req) async {
  for (final e in _routes.entries) {
    if (req.url.path == e.key) return http.Response(jsonEncode(e.value), 200, headers: {'content-type': 'application/json'});
  }
  return http.Response('[]', 200);
});

/// Opens [screen] at a typical phone width (360) with the API answered by
/// [routes]. [height] can be raised so a long list builds every item at once.
Future<void> pumpScreen(WidgetTester tester, Widget screen, Map<String, Object> routes, {double height = 780}) async {
  tester.view.physicalSize = Size(360, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({
    'token': 'test-token',
    'tour_seen_apps_tools_v1': true,
    'user': jsonEncode({'id': 'me', 'name': longName, 'email': 'me@example.com', 'role': 'sales'}),
  });
  _routes = routes;
  await http.runWithClient(() async {
    await tester.pumpWidget(MaterialApp(theme: appLightTheme, home: screen));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }, () => _client);
}

Map<String, Object> rep(String id, String name, num revenue) => {
      'id': id,
      'repUserId': id,
      'name': name,
      'revenue': revenue,
      'branch': 'Dallas–Fort Worth Metroplex North',
      'team': 'Hendrickson Storm Restoration Crew',
      'headshotUrl': '',
    };

