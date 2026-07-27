// READ-ONLY audit: re-marks every stored quiz result with the course's own
// answer key and reports what holds up (spec 2026-07-26 §7).
//
// Run from the repo root with the SSH tunnel open:
//   node scripts/audit-quiz-grades.js
//
// This script WRITES NOTHING. It exists to tell Youssef whether the
// client-graded era produced any passes that do not hold up.
//
// The two grading rules below are a deliberate mirror of
// src/lib/training/quiz-grading.ts (this is plain JS and cannot import the TS
// module). Keep them in sync if the rules ever change.

const fs = require("fs");
const path = require("path");

const env = {};
for (const raw of fs.readFileSync(path.join(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const s = raw.trim();
  if (!s || s.startsWith("#")) continue;
  const eq = s.indexOf("=");
  if (eq === -1) continue;
  env[s.slice(0, eq).trim()] = s.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
}

const { MongoClient } = require(path.join(process.cwd(), "node_modules", "mongodb"));

const PASS_THRESHOLD = 0.8;

function presentedCount(page) {
  const pool = page.quizQuestions || [];
  const limit = page.questionsToShow;
  return typeof limit === "number" && limit > 0 && limit < pool.length ? limit : pool.length;
}

function grade(page, answers) {
  const pool = page.quizQuestions || [];
  const byId = new Map(pool.map((q) => [q.id, q]));
  const total = presentedCount(page);
  let correct = 0;
  let known = 0;
  for (const [questionId, chosenIndex] of Object.entries(answers || {})) {
    const q = byId.get(questionId);
    if (!q || typeof q.correctIndex !== "number") continue;
    known++;
    if (chosenIndex === q.correctIndex) correct++;
  }
  correct = Math.min(correct, total);
  const pct = total > 0 ? correct / total : 0;
  return { correct, total, pct, passed: total > 0 && pct >= PASS_THRESHOLD, answeredStillInPool: known };
}

(async () => {
  const client = new MongoClient(env.MONGODB_URI);
  await client.connect();
  const db = client.db("millerstorm");

  const courses = await db.collection("courses").find({}).toArray();
  const pageIndex = new Map(); // `${courseId}:${pageId}` -> { page, courseTitle }
  for (const course of courses) {
    for (const page of course.pages || []) {
      pageIndex.set(`${course.id}:${page.id}`, { page, courseTitle: course.title || course.id });
    }
  }

  const users = await db.collection("users").find({}).project({ id: 1, name: 1, email: 1 }).toArray();
  const nameById = new Map(users.map((u) => [u.id, u.name || u.email || u.id]));

  const counts = {
    holdsUp: 0,
    failsRemark: 0,
    failsAndJudgeable: 0,
    quizRewritten: 0,
    noAnswers: 0,
    pageGone: 0,
    total: 0,
  };
  const failures = [];

  const progressDocs = await db.collection("userprogresses").find({}).toArray();
  for (const doc of progressDocs) {
    for (const result of doc.quizResults || []) {
      counts.total++;
      const found = pageIndex.get(`${doc.courseId}:${result.pageId}`);
      if (!found || !(found.page.quizQuestions || []).length) {
        counts.pageGone++;
        continue;
      }
      const answers = result.answers || {};
      if (!Object.keys(answers).length) {
        counts.noAnswers++;
        continue;
      }
      const g = grade(found.page, answers);
      if (g.passed) {
        counts.holdsUp++;
        continue;
      }
      counts.failsRemark++;
      // A result whose answered question ids are ALL gone from the pool cannot
      // be judged: the quiz was rewritten after the attempt (question ids are
      // regenerated), so re-marking scores it 0 for an innocent reason. Only a
      // result whose questions still exist is evidence of anything.
      const answeredCount = Object.keys(answers).length;
      const judgeable = g.answeredStillInPool > 0;
      if (judgeable) counts.failsAndJudgeable++;
      else counts.quizRewritten++;
      failures.push({
        judgeable,
        rep: nameById.get(doc.userId) || doc.userId,
        course: found.courseTitle,
        quiz: found.page.title || result.pageId,
        claimed: result.score ? `${result.score.correct}/${result.score.total}` : "none",
        remarked: `${g.correct}/${g.total}`,
        answeredStillInPool: `${g.answeredStillInPool}/${answeredCount}`,
      });
    }
  }

  console.log("\n=== Quiz grade audit (read-only) ===");
  console.log(`Stored quiz results:           ${counts.total}`);
  console.log(`Hold up when re-marked:        ${counts.holdsUp}`);
  console.log(`Fail re-marking:               ${counts.failsRemark}`);
  console.log(`  of which quiz was rewritten: ${counts.quizRewritten}  (not judgeable, innocent)`);
  console.log(`  of which JUDGEABLE:          ${counts.failsAndJudgeable}  <-- the only rows that mean anything`);
  console.log(`Cannot judge (no answers):     ${counts.noAnswers}`);
  console.log(`Cannot judge (quiz gone):      ${counts.pageGone}`);

  const judgeable = failures.filter((f) => f.judgeable);
  if (judgeable.length) {
    console.log("\n--- JUDGEABLE failures: the questions still exist, so these are real ---");
    for (const f of judgeable) {
      console.log(
        `${f.rep} | ${f.course} | ${f.quiz} | claimed ${f.claimed} | re-marked ${f.remarked} | answered still in pool ${f.answeredStillInPool}`
      );
    }
  } else if (failures.length) {
    console.log("\nNo judgeable failures: every failing row is a rewritten quiz.");
  }

  const rewritten = failures.filter((f) => !f.judgeable);
  if (rewritten.length) {
    console.log(`\n--- Not judgeable: ${rewritten.length} results whose quiz was rewritten after the attempt ---`);
    console.log("None of the answered question ids still exist, so re-marking scores them 0 for an");
    console.log("innocent reason. Listed by rep so the spread is visible, not as evidence.\n");
    const byRep = new Map();
    for (const f of rewritten) byRep.set(f.rep, (byRep.get(f.rep) || 0) + 1);
    for (const [rep, n] of [...byRep.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`${rep}: ${n}`);
    }
  }

  await client.close();
})().catch((e) => {
  console.error("AUDIT ERROR:", e.message);
  process.exit(1);
});
