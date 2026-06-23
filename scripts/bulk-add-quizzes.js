/**
 * Bulk-add quizzes after lessons.
 *
 * Reads a plain-language quiz document (see scripts/quizzes.example.md),
 * matches each lesson by title inside its course, and inserts a quiz page
 * directly AFTER that lesson in the course's `pages[]` array.
 *
 * USAGE:
 *   1. Preview (no DB changes) — ALWAYS run this first:
 *        node scripts/bulk-add-quizzes.js scripts/quizzes.md
 *
 *   2. Commit the changes to MongoDB:
 *        node scripts/bulk-add-quizzes.js scripts/quizzes.md --commit
 *
 * Re-running is SAFE: each generated quiz has a deterministic id
 * (quiz-after-<lessonId>). Running again UPDATES that quiz instead of
 * creating a duplicate.
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config();

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/millerstorm";
const DB_NAME = "millerstorm";

// ---------------------------------------------------------------------------
// Parsing the document
// ---------------------------------------------------------------------------

function parseDoc(text) {
  const lines = text.split(/\r?\n/);
  const courses = [];
  let course = null;
  let lesson = null;
  let question = null;

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

    // Option:  "- ..."  /  "* ..."  /  "- [x] ..."  / "(correct)" suffix
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
      // trailing markers: (correct) or ✓ or trailing *
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
          throw new Error(
            `Line ${lineNo}: question has more than one correct answer marked.`
          );
        }
        question.correctIndex = question.options.length;
      }
      question.options.push(optText);
      return;
    }

    throw new Error(
      `Line ${lineNo}: could not understand this line:\n  "${raw}"\n` +
        `Expected a Course header, Lesson header, "Show: N", a numbered question, or an option line.`
    );
  });

  pushCourse();
  return courses;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(courses) {
  const errors = [];
  if (courses.length === 0) errors.push("No courses found in the document.");
  courses.forEach((c) => {
    if (c.lessons.length === 0)
      errors.push(`Course "${c.key}" (line ${c.lineNo}) has no lessons.`);
    c.lessons.forEach((l) => {
      if (l.questions.length === 0)
        errors.push(`Lesson "${l.title}" (line ${l.lineNo}) has no questions.`);
      if (l.questionsToShow != null && l.questionsToShow > l.questions.length)
        errors.push(
          `Lesson "${l.title}" (line ${l.lineNo}): Show: ${l.questionsToShow} but only ${l.questions.length} questions provided.`
        );
      l.questions.forEach((q) => {
        if (q.options.length < 2)
          errors.push(
            `Question "${q.prompt}" (line ${q.lineNo}) needs at least 2 options.`
          );
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
// Matching helpers
// ---------------------------------------------------------------------------

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

function findCourse(courseDocs, key) {
  const k = norm(key);
  return (
    courseDocs.find((c) => norm(c.id) === k) ||
    courseDocs.find((c) => norm(c.title) === k) ||
    courseDocs.find((c) => norm(c.title).includes(k) || k.includes(norm(c.title)))
  );
}

function findLessonIndex(pages, title) {
  const t = norm(title);
  // exact, non-quiz first
  let idx = pages.findIndex((p) => !p.isQuiz && norm(p.title) === t);
  if (idx !== -1) return idx;
  // fuzzy contains
  idx = pages.findIndex(
    (p) => !p.isQuiz && (norm(p.title).includes(t) || t.includes(norm(p.title)))
  );
  return idx;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function buildQuizPage(lessonPage, lessonSpec) {
  const lessonId = lessonPage.id || slugify(lessonPage.title);
  const quizId = `quiz-after-${lessonId}`;
  const quizQuestions = lessonSpec.questions.map((q, i) => ({
    id: `${quizId}-q${i + 1}`,
    prompt: q.prompt,
    options: q.options,
    correctIndex: q.correctIndex,
  }));
  const page = {
    id: quizId,
    title: `${lessonPage.title} — Quiz`,
    status: lessonPage.status || "published",
    body: "",
    folderId: lessonPage.folderId || undefined,
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const docPath = args.find((a) => !a.startsWith("--")) || "scripts/quizzes.md";
  const abs = path.resolve(process.cwd(), docPath);

  if (!fs.existsSync(abs)) {
    console.error(`\n❌ Document not found: ${abs}`);
    console.error(`   Create it (copy scripts/quizzes.example.md) and try again.\n`);
    process.exit(1);
  }

  console.log(`\n📄 Reading: ${abs}`);
  const text = fs.readFileSync(abs, "utf8");

  let parsed;
  try {
    parsed = parseDoc(text);
  } catch (e) {
    console.error(`\n❌ Could not parse the document:\n   ${e.message}\n`);
    process.exit(1);
  }

  const errors = validate(parsed);
  if (errors.length) {
    console.error(`\n❌ Found ${errors.length} problem(s) in the document:`);
    errors.forEach((e) => console.error("   • " + e));
    console.error("");
    process.exit(1);
  }

  const totalQ = parsed.reduce(
    (s, c) => s + c.lessons.reduce((s2, l) => s2 + l.questions.length, 0),
    0
  );
  console.log(
    `✅ Parsed ${parsed.length} course block(s), ${parsed.reduce(
      (s, c) => s + c.lessons.length,
      0
    )} lesson quiz(zes), ${totalQ} question(s).`
  );

  console.log(`\n🔌 Connecting to MongoDB (${DB_NAME})...`);
  await mongoose.connect(uri, { dbName: DB_NAME, serverSelectionTimeoutMS: 10000 });
  const col = mongoose.connection.collection("courses");
  const courseDocs = await col.find({}).toArray();
  console.log(`   Loaded ${courseDocs.length} course(s) from the database.\n`);

  const plan = []; // { courseDoc, newPages, summaryLines }
  const warnings = [];

  for (const cSpec of parsed) {
    const courseDoc = findCourse(courseDocs, cSpec.key);
    if (!courseDoc) {
      warnings.push(`Course not found in DB: "${cSpec.key}" — skipped (${cSpec.lessons.length} quizzes).`);
      continue;
    }
    const pages = Array.isArray(courseDoc.pages) ? courseDoc.pages.slice() : [];
    const summaryLines = [];
    let inserts = 0;
    let updates = 0;

    // Insert from the bottom up so indexes stay valid.
    const ops = [];
    for (const lSpec of cSpec.lessons) {
      const lessonIdx = findLessonIndex(pages, lSpec.title);
      if (lessonIdx === -1) {
        warnings.push(
          `Lesson not found in course "${courseDoc.title}": "${lSpec.title}" — skipped.`
        );
        continue;
      }
      ops.push({ lessonIdx, lSpec, lessonPage: pages[lessonIdx] });
    }
    // Sort descending so earlier insertions don't shift later indexes.
    ops.sort((a, b) => b.lessonIdx - a.lessonIdx);

    for (const op of ops) {
      const quizPage = buildQuizPage(op.lessonPage, op.lSpec);
      const existingIdx = pages.findIndex((p) => p.id === quizPage.id);
      if (existingIdx !== -1) {
        pages[existingIdx] = quizPage; // update in place
        updates++;
        summaryLines.push(
          `   ↻ update quiz after "${op.lessonPage.title}" (${quizPage.quizQuestions.length} Q${
            quizPage.questionsToShow ? `, show ${quizPage.questionsToShow}` : ""
          })`
        );
      } else {
        pages.splice(op.lessonIdx + 1, 0, quizPage); // insert right after lesson
        inserts++;
        summaryLines.push(
          `   + add quiz after "${op.lessonPage.title}" (${quizPage.quizQuestions.length} Q${
            quizPage.questionsToShow ? `, show ${quizPage.questionsToShow}` : ""
          })`
        );
      }
    }

    if (inserts + updates > 0) {
      plan.push({ courseDoc, pages, summaryLines, inserts, updates });
    }
  }

  // ---- Report ----
  console.log("──────────────────────────────────────────────");
  console.log(commit ? "COMMIT PLAN" : "DRY RUN — preview only (no changes made)");
  console.log("──────────────────────────────────────────────");
  if (plan.length === 0) {
    console.log("Nothing to do — no matching lessons found.");
  }
  let totalAdd = 0,
    totalUpd = 0;
  for (const p of plan) {
    console.log(`\n📚 ${p.courseDoc.title}  (id: ${p.courseDoc.id})`);
    p.summaryLines.forEach((l) => console.log(l));
    totalAdd += p.inserts;
    totalUpd += p.updates;
  }
  console.log(`\nTotal: ${totalAdd} quiz(zes) to add, ${totalUpd} to update.`);

  if (warnings.length) {
    console.log(`\n⚠️  ${warnings.length} warning(s):`);
    warnings.forEach((w) => console.log("   • " + w));
  }

  if (!commit) {
    console.log(
      `\n👉 Looks good? Re-run with --commit to apply:\n   node scripts/bulk-add-quizzes.js ${docPath} --commit\n`
    );
    await mongoose.disconnect();
    return;
  }

  // ---- Commit ----
  console.log("\n💾 Writing to MongoDB...");
  for (const p of plan) {
    await col.updateOne({ id: p.courseDoc.id }, { $set: { pages: p.pages } });
    console.log(`   ✓ ${p.courseDoc.title}`);
  }
  console.log(`\n✅ Done. Added ${totalAdd}, updated ${totalUpd} quiz(zes).\n`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
