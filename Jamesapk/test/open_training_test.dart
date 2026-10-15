// Who reviews training freely on the phone (PR #100, 2026-10-15): marketing
// joined leadership, so every lesson and quiz is open to them, as on the web
// (src/lib/training/access.ts). Sales reps still go in order.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:millerstorm_app/screens/course_detail_screen.dart';

import 'support/long_names_harness.dart';

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

// A course nobody has started: lesson 1, lesson 2, then the quiz.
final course = {
  'id': 'c1',
  'title': 'Roofing 101',
  'pages': [
    {'id': 'p1', 'title': 'Lesson One', 'status': 'published', 'videoUrl': 'https://vimeo.com/1'},
    {'id': 'p2', 'title': 'Lesson Two', 'status': 'published', 'videoUrl': 'https://vimeo.com/2'},
    {'id': 'q1', 'title': 'Final Quiz', 'status': 'published', 'isQuiz': true},
  ],
  'completedPages': <String>[],
  'unlockedPages': <String>[],
  'quizResults': <Object>[],
  'progress': {'completedLessons': 0, 'totalLessons': 3, 'progressPercent': 0},
};

Future<int> locksFor(WidgetTester tester, String role) async {
  await pumpScreen(
    tester,
    const CourseDetailScreen(courseId: 'c1', courseTitle: 'Roofing 101'),
    {'/api/courses/c1': course, '/api/users/me': {'id': 'me', 'role': role}},
    height: 1400,
    role: role,
  );
  await settle(tester);
  expect(find.text('Lesson Two'), findsOneWidget);
  return find.byIcon(Icons.lock_outline).evaluate().length;
}

void main() {
  setUpAll(loadRealFonts);

  testWidgets('marketing sees every lesson and the quiz open', (tester) async {
    expect(await locksFor(tester, 'marketing'), 0);
  });

  testWidgets('leadership still sees every lesson open', (tester) async {
    expect(await locksFor(tester, 'branch-manager'), 0);
  });

  testWidgets('a sales rep still goes in order: lesson two and the quiz wait', (tester) async {
    expect(await locksFor(tester, 'sales'), 2);
  });
}
