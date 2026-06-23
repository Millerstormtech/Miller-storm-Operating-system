import type { Course, CoursePage, QuizQuestion } from "../types";

/**
 * Shared logic for the "Import Quizzes" feature.
 *
 * It parses a plain-language quiz document (see scripts/quizzes.example.md),
 * matches each lesson by title inside its course, and inserts a quiz page
 * directly AFTER that lesson in the course's `pages[]` array.
 *
 * Document format (one block per course / lesson):
 *
 *   # Course: <course title or id>
 *   ## Lesson: <lesson title>
 *   Show: 2                        (optional — questions to show per attempt)
 *   1. Question text?
 *   - wrong option
 *   * correct option               ("*" marks the answer; "(correct)" also works)
 *   - wrong option
 *
 * This module is PURE (no DB access) so it can be unit-tested and reused.
 */

export type ParsedQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
  lineNo: number;
};

export type ParsedLesson = {
  title: string;
  questionsToShow?: number;
  questions: ParsedQuestion[];
  lineNo: number;
};

export type ParsedCourse = {
  key: string; // course title OR id, as written in the doc
  lessons: ParsedLesson[];
  lineNo: number;
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseQuizDoc(text: string): ParsedCourse[] {
  const lines = text.split(/\r?\n/);
  const courses: ParsedCourse[] = [];
  let course: ParsedCourse | null = null;
  let lesson: ParsedLesson | null = null;
  let question: ParsedQuestion | null = null;

  const pushQuestion = () => {
    if (question && lesson) {
      lesson.questions.push(question);
      question = null;
    }
  };
  const pushLesson = () => {
    pushQuestion();
    if (lesson && course) {
      course.lessons.push(lesson);
      lesson = null;
    }
  };
  const pushCourse = () => {
    pushLesson();
    if (course) {
      courses.push(course);
      course = null;
    }
  };

  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const line = raw.trim();
    if (!line) return;

    // Course header:  "# Course: <title or id>"
    let m = line.match(/^#\s*Course\s*:\s*(.+)$/i);
    if (m) {
      pushCourse();
      course = { key: m[1].trim(), lessons: [], lineNo };
      return;
    }

    // Lesson header:  "## Lesson: <title>"  (checked before the generic
    // comment skip below, since it also starts with "#")
    m = line.match(/^#{1,6}\s*Lesson\s*:\s*(.+)$/i);
    if (m) {
      if (!course) throw new Error(`Line ${lineNo}: "Lesson:" found before any "Course:"`);
      pushLesson();
      lesson = { title: m[1].trim(), questionsToShow: undefined, questions: [], lineNo };
      return;
    }

    // Comment lines (anything else starting with #) are ignored.
    if (line.startsWith("#")) return;

    // "Show: N"  /  "Questions to show: N"
    m = line.match(/^(?:Show|Questions to show)\s*:\s*(\d+)\s*$/i);
    if (m) {
      if (!lesson) throw new Error(`Line ${lineNo}: "Show:" found before any "Lesson:"`);
      lesson.questionsToShow = parseInt(m[1], 10);
      return;
    }

    // Question:  "1. ..."  /  "1) ..."  /  "Q: ..."
    m = line.match(/^(?:\d+[.)]|Q[.:])\s*(.+)$/i);
    if (m) {
      if (!lesson) throw new Error(`Line ${lineNo}: question found before any "Lesson:"`);
      pushQuestion();
      question = { prompt: m[1].trim(), options: [], correctIndex: -1, lineNo };
      return;
    }

    // Option:  "- ..."  /  "* ..."  /  "- [x] ..."  /  "(correct)" suffix
    m = line.match(/^([-*•])\s*(.+)$/);
    if (m) {
      if (!question) throw new Error(`Line ${lineNo}: answer option found before any question`);
      const bullet = m[1];
      let optText = m[2].trim();
      let isCorrect = bullet === "*";

      // "- [x]" / "- [X]" checkbox style
      const cb = optText.match(/^\[(x| )\]\s*(.+)$/i);
      if (cb) {
        if (cb[1].toLowerCase() === "x") isCorrect = true;
        optText = cb[2].trim();
      }
      // trailing markers: (correct) or ✓
      if (/\s*\(correct\)\s*$/i.test(optText)) {
        isCorrect = true;
        optText = optText.replace(/\s*\(correct\)\s*$/i, "").trim();
      }
      if (/\s*[✓✔]\s*$/.test(optText)) {
        isCorrect = true;
        optText = optText.replace(/\s*[✓✔]\s*$/, "").trim();
      }

      if (isCorrect) {
        if (question.correctIndex !== -1) {
          throw new Error(`Line ${lineNo}: question has more than one correct answer marked.`);
        }
        question.correctIndex = question.options.length;
      }
      question.options.push(optText);
      return;
    }

    throw new Error(
      `Line ${lineNo}: could not understand this line: "${raw}". ` +
        `Expected a Course header, Lesson header, "Show: N", a numbered question, or an option line.`
    );
  });

  pushCourse();
  return courses;
}

// ---------------------------------------------------------------------------
// Questions-only parsing (for importing directly into ONE quiz page)
// ---------------------------------------------------------------------------
//
// No course/lesson headers needed — just an optional "Show: N" and a list of
// numbered questions with options ("*" / "(correct)" marks the answer):
//
//   Show: 3
//   1. Question?
//   - wrong
//   * correct
//   - wrong

export type ParsedQuestionsDoc = {
  questionsToShow?: number;
  questions: ParsedQuestion[];
};

export function parseQuestionsDoc(text: string): ParsedQuestionsDoc {
  const lines = text.split(/\r?\n/);
  const questions: ParsedQuestion[] = [];
  let questionsToShow: number | undefined;
  let question: ParsedQuestion | null = null;
  let expectShowNumber = false; // saw a "Questions to show" label, number on next line

  const push = () => {
    if (question) {
      questions.push(question);
      question = null;
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const lineNo = idx + 1;
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue; // ignore comments / stray Course/Lesson headers

    // "Show: N" / "Questions to show: N" / "Questions to show the user" (number on next line)
    let m = line.match(/^(?:show|questions?\s*to\s*show)\b[^0-9]*?(\d+)?\s*$/i);
    if (m && !/^\d+[.)]/.test(line)) {
      if (m[1]) questionsToShow = parseInt(m[1], 10);
      else expectShowNumber = true; // a bare "Questions to show the user" label
      continue;
    }

    // A standalone number right after a "Questions to show" label.
    if (/^\d+$/.test(line)) {
      if (expectShowNumber) {
        questionsToShow = parseInt(line, 10);
        expectShowNumber = false;
      }
      continue; // otherwise a stray number — ignore
    }
    expectShowNumber = false;

    // "Correct Answer: C" / "Correct: C. Paris" / "Answer: Paris"
    m = line.match(/^(?:correct\s*answer|correct|answer)\s*[:\-]\s*(.+)$/i);
    if (m) {
      if (question) setCorrectFromText(question, m[1].trim());
      continue;
    }

    // Question:  "1. ..."  /  "1) ..."  /  "Q: ..."
    m = line.match(/^(?:\d+[.)]|Q[.:])\s*(.+)$/i);
    if (m) {
      push();
      question = { prompt: m[1].trim(), options: [], correctIndex: -1, lineNo };
      continue;
    }

    // Option (markdown bullet):  "- ..." / "* ..." / "• ..."
    m = line.match(/^([-*•])\s*(.+)$/);
    if (m) {
      if (!question) continue; // stray option — ignore
      const parsed = parseOption(m[1], m[2]);
      if (parsed.isCorrect && question.correctIndex === -1) question.correctIndex = question.options.length;
      question.options.push(parsed.text);
      continue;
    }

    // Option (lettered):  "A. ..." / "B) ..." / "a. ..."
    m = line.match(/^([A-Za-z])[.)]\s+(.+)$/);
    if (m && question) {
      let optText = m[2].trim();
      let isCorrect = false;
      if (/\s*\(correct\)\s*$/i.test(optText)) {
        isCorrect = true;
        optText = optText.replace(/\s*\(correct\)\s*$/i, "").trim();
      }
      if (isCorrect && question.correctIndex === -1) question.correctIndex = question.options.length;
      question.options.push(optText);
      continue;
    }

    // Unknown line: treat as a continuation of the prompt if options haven't
    // started yet; otherwise ignore it as noise (e.g. a "Quiz Questions" header).
    if (question && question.options.length === 0) {
      question.prompt = `${question.prompt} ${line}`.trim();
    }
  }

  push();
  return { questionsToShow, questions };
}

// Resolve a "Correct Answer: …" value (a letter, a number, "C. Paris", or the
// answer text) into the matching option index on the question.
function setCorrectFromText(question: ParsedQuestion, value: string): void {
  const text = value.trim();
  let idx = -1;

  const single = text.match(/^([A-Za-z])$/); // "C"
  const lettered = text.match(/^([A-Za-z])[.)]/); // "C." / "C)"
  const numeric = text.match(/^(\d+)\b/); // "3"
  if (single) idx = single[1].toUpperCase().charCodeAt(0) - 65;
  else if (lettered) idx = lettered[1].toUpperCase().charCodeAt(0) - 65;
  else if (numeric) idx = parseInt(numeric[1], 10) - 1;

  if (idx >= 0 && idx < question.options.length) {
    question.correctIndex = idx;
    return;
  }

  // Fall back to matching the answer text against the option texts.
  const cleaned = text.replace(/^[A-Za-z][.)]\s*/, "").trim().toLowerCase();
  const found = question.options.findIndex((o) => o.trim().toLowerCase() === cleaned);
  if (found !== -1) question.correctIndex = found;
}

export function validateQuestions(doc: ParsedQuestionsDoc): string[] {
  const errors: string[] = [];
  if (doc.questions.length === 0) errors.push("No questions found.");
  if (doc.questionsToShow != null && doc.questionsToShow > doc.questions.length)
    errors.push(`Show: ${doc.questionsToShow} but only ${doc.questions.length} questions provided.`);
  doc.questions.forEach((q) => {
    if (q.options.length < 2) errors.push(`Question "${q.prompt}" needs at least 2 options.`);
    if (q.correctIndex === -1)
      errors.push(`Question "${q.prompt}" has no correct answer marked (use "*" or "(correct)").`);
  });
  return errors;
}

// Parse a single option line's text + whether it's the correct one.
function parseOption(bullet: string, rest: string): { text: string; isCorrect: boolean } {
  let optText = rest.trim();
  let isCorrect = bullet === "*";

  const cb = optText.match(/^\[(x| )\]\s*(.+)$/i);
  if (cb) {
    if (cb[1].toLowerCase() === "x") isCorrect = true;
    optText = cb[2].trim();
  }
  if (/\s*\(correct\)\s*$/i.test(optText)) {
    isCorrect = true;
    optText = optText.replace(/\s*\(correct\)\s*$/i, "").trim();
  }
  if (/\s*[✓✔]\s*$/.test(optText)) {
    isCorrect = true;
    optText = optText.replace(/\s*[✓✔]\s*$/, "").trim();
  }
  return { text: optText, isCorrect };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateParsed(courses: ParsedCourse[]): string[] {
  const errors: string[] = [];
  if (courses.length === 0) errors.push("No courses found in the document.");
  courses.forEach((c) => {
    if (c.lessons.length === 0) errors.push(`Course "${c.key}" (line ${c.lineNo}) has no lessons.`);
    c.lessons.forEach((l) => {
      if (l.questions.length === 0)
        errors.push(`Lesson "${l.title}" (line ${l.lineNo}) has no questions.`);
      if (l.questionsToShow != null && l.questionsToShow > l.questions.length)
        errors.push(
          `Lesson "${l.title}" (line ${l.lineNo}): Show: ${l.questionsToShow} but only ${l.questions.length} questions provided.`
        );
      l.questions.forEach((q) => {
        if (q.options.length < 2)
          errors.push(`Question "${q.prompt}" (line ${q.lineNo}) needs at least 2 options.`);
        if (q.correctIndex === -1)
          errors.push(
            `Question "${q.prompt}" (line ${q.lineNo}) has no correct answer marked (use "*" or "(correct)").`
          );
      });
    });
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Matching + plan building
// ---------------------------------------------------------------------------

const norm = (s: unknown) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

function findCourse(courseDocs: Course[], key: string): Course | undefined {
  const k = norm(key);
  return (
    courseDocs.find((c) => norm(c.id) === k) ||
    courseDocs.find((c) => norm(c.title) === k) ||
    courseDocs.find((c) => norm(c.title).includes(k) || k.includes(norm(c.title)))
  );
}

function findLessonIndex(pages: CoursePage[], title: string): number {
  const t = norm(title);
  let idx = pages.findIndex((p) => !p.isQuiz && norm(p.title) === t);
  if (idx !== -1) return idx;
  idx = pages.findIndex((p) => !p.isQuiz && (norm(p.title).includes(t) || t.includes(norm(p.title))));
  return idx;
}

function slugify(s: unknown): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function buildQuizPage(lessonPage: CoursePage, lessonSpec: ParsedLesson): CoursePage {
  const lessonId = lessonPage.id || slugify(lessonPage.title);
  const quizId = `quiz-after-${lessonId}`;
  const quizQuestions: QuizQuestion[] = lessonSpec.questions.map((q, i) => ({
    id: `${quizId}-q${i + 1}`,
    prompt: q.prompt,
    options: q.options,
    correctIndex: q.correctIndex,
  }));
  const page: CoursePage = {
    id: quizId,
    title: `${lessonPage.title} — Quiz`,
    status: lessonPage.status || "published",
    body: "",
    folderId: lessonPage.folderId,
    videoUrl: "",
    transcript: "",
    pinnedCommunityPostUrl: "",
    resourceLinks: [],
    fileUrls: [],
    isQuiz: true,
    quizQuestions,
  };
  if (lessonSpec.questionsToShow != null) page.questionsToShow = lessonSpec.questionsToShow;
  return page;
}

export type ImportItem = {
  course: string;
  lesson: string;
  action: "add" | "update";
  questionCount: number;
  questionsToShow?: number;
};

export type ImportReport = {
  items: ImportItem[];
  warnings: string[];
  added: number;
  updated: number;
};

export type ImportPlan = {
  updatedCourses: Course[]; // only courses that actually changed
  report: ImportReport;
};

/**
 * Given the current course documents and a parsed quiz spec, produce the set
 * of updated course objects (with quiz pages inserted after their lessons)
 * plus a human-readable report. Pure — does not touch the DB.
 */
export function buildImportPlan(courseDocs: Course[], parsed: ParsedCourse[]): ImportPlan {
  const updatedCourses: Course[] = [];
  const items: ImportItem[] = [];
  const warnings: string[] = [];
  let added = 0;
  let updated = 0;

  for (const cSpec of parsed) {
    const courseDoc = findCourse(courseDocs, cSpec.key);
    if (!courseDoc) {
      warnings.push(`Course not found: "${cSpec.key}" — skipped ${cSpec.lessons.length} quiz(zes).`);
      continue;
    }
    const pages: CoursePage[] = Array.isArray(courseDoc.pages) ? courseDoc.pages.slice() : [];

    // Resolve lesson positions first, then insert from the bottom up so earlier
    // insertions don't shift later indexes.
    const ops: { lessonIdx: number; lSpec: ParsedLesson; lessonPage: CoursePage }[] = [];
    for (const lSpec of cSpec.lessons) {
      const lessonIdx = findLessonIndex(pages, lSpec.title);
      if (lessonIdx === -1) {
        warnings.push(`Lesson not found in course "${courseDoc.title}": "${lSpec.title}" — skipped.`);
        continue;
      }
      ops.push({ lessonIdx, lSpec, lessonPage: pages[lessonIdx] });
    }
    ops.sort((a, b) => b.lessonIdx - a.lessonIdx);

    let changed = false;
    for (const op of ops) {
      const quizPage = buildQuizPage(op.lessonPage, op.lSpec);
      const existingIdx = pages.findIndex((p) => p.id === quizPage.id);
      if (existingIdx !== -1) {
        pages[existingIdx] = quizPage;
        updated++;
        changed = true;
        items.push({
          course: courseDoc.title,
          lesson: op.lessonPage.title,
          action: "update",
          questionCount: quizPage.quizQuestions?.length || 0,
          questionsToShow: quizPage.questionsToShow,
        });
      } else {
        pages.splice(op.lessonIdx + 1, 0, quizPage);
        added++;
        changed = true;
        items.push({
          course: courseDoc.title,
          lesson: op.lessonPage.title,
          action: "add",
          questionCount: quizPage.quizQuestions?.length || 0,
          questionsToShow: quizPage.questionsToShow,
        });
      }
    }

    if (changed) {
      updatedCourses.push({ ...courseDoc, pages });
    }
  }

  return { updatedCourses, report: { items, warnings, added, updated } };
}
