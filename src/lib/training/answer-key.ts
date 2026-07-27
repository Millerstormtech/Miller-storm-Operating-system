// Removes correctIndex from quiz questions before a course leaves the server
// (spec 2026-07-26 §6). Rebuilds each question from an EXPLICIT field list, so
// a future schema field can never leak through by accident.
//
// Only the `admin` role keeps the key (the course builder writes quizzes), and
// the mobile lesson player's ?pageId= fetch keeps it until the Flutter app
// switches to POST /api/training/quiz.

function stripQuestions(questions: any[]): any[] {
  return questions.map((q: any) => ({ id: q?.id, prompt: q?.prompt, options: q?.options }));
}

export function stripAnswerKeyFromPages<T>(pages: T[]): T[] {
  return (pages || []).map((page: any) =>
    page && Array.isArray(page.quizQuestions)
      ? { ...page, quizQuestions: stripQuestions(page.quizQuestions) }
      : page
  ) as T[];
}

export function stripAnswerKeyFromCourses(courses: any[]): any[] {
  return (courses || []).map((course: any) => {
    if (!course) return course;
    const next: any = { ...course };
    if (Array.isArray(next.pages)) next.pages = stripAnswerKeyFromPages(next.pages);
    // Courses also carry a legacy top-level quizQuestions array.
    if (Array.isArray(next.quizQuestions)) next.quizQuestions = stripQuestions(next.quizQuestions);
    return next;
  });
}
