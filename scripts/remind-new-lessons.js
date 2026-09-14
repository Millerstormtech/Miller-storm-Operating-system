#!/usr/bin/env node
/**
 * One-off reminder for reps who finished a course before lessons were added to
 * it (2026-09-13). On 11 September, 36 of Phase 1's 48 graduates had never seen
 * the lessons added after they passed. Youssef decided reps should watch them.
 *
 * "Added after they finished" is decided by time, exactly as
 * newSinceFinished() in src/lib/training/new-since-finished.ts decides it (a
 * plain script cannot import TypeScript, so the rule is repeated here):
 *   - a lesson created after the rep finished that they have not watched;
 *   - a quiz created after the rep finished that belongs to such a lesson.
 * Lessons they skipped through an unlock, and quizzes added later under lessons
 * they already had, are NOT new. Page ids carry their creation time; the finish
 * time is the rep's passing final test, else their latest recorded quiz or
 * lesson. No finish time: no reminder.
 *
 * Each person gets ONE reminder per course: an in-app "new training" pop-up and
 * bell item that opens the first new item on the right page for their role.
 * Accounts flagged as test accounts, the shared and developer mailboxes in
 * src/lib/training/excluded-accounts.ts, deleted and suspended accounts, and
 * anyone already reminded are skipped.
 *
 * DRY RUN BY DEFAULT: prints every reminder it would create. Nothing is sent
 * until someone has read that list and approved it.
 *
 * Usage (from the repo root, with MONGODB_URI in .env or the environment):
 *   node scripts/remind-new-lessons.js           # dry run
 *   node scripts/remind-new-lessons.js --send    # create the reminders
 */
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

function loadEnv() {
  const p = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

// The scrub-list the leaderboard uses, read from its source so the two never drift.
function excludedEmails() {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "training", "excluded-accounts.ts"), "utf8");
  return new Set([...src.matchAll(/"([^"\s@]+@[^"\s]+)"/g)].map((m) => m[1].toLowerCase()));
}

const REMINDER_KIND = "new-since-finished";
const trainingRoute = (role) => (role === "sales" ? "/sales/training" : "/manager/onlineTraining");
const passing = (r) => !!r && r.passed !== false;

function pageCreatedAt(id) {
  const m = /(\d{13})\D*$/.exec(String(id || ""));
  const t = m ? Number(m[1]) : NaN;
  return t > Date.UTC(2024, 0, 1) && t < Date.UTC(2031, 0, 1) ? t : null;
}

function timeOf(stamp) {
  if (stamp === null || stamp === undefined || stamp === "") return null;
  const t = new Date(stamp).getTime();
  return Number.isFinite(t) ? t : null;
}

function finishedAt(course, progress) {
  if (!progress || !progress.courseCompleted) return null;
  const finals = new Set((course.pages || []).filter((p) => p.isFinalTest).map((p) => p.id));
  const results = (progress.quizResults || []).filter(Boolean);
  const finalPasses = results.filter((r) => r.pageId && finals.has(r.pageId) && passing(r)).map((r) => timeOf(r.submittedAt)).filter((t) => t !== null);
  if (finalPasses.length) return Math.max(...finalPasses);
  const activity = [...results.map((r) => timeOf(r.submittedAt)), ...(progress.pageCompletions || []).map((c) => timeOf(c && c.completedAt))].filter((t) => t !== null);
  return activity.length ? Math.max(...activity) : null;
}

function inDisplayOrder(pages, folders) {
  const known = new Set(folders.map((f) => f.id));
  return [
    ...pages.filter((p) => !p.folderId),
    ...folders.flatMap((f) => pages.filter((p) => p.folderId === f.id)),
    ...pages.filter((p) => p.folderId && !known.has(p.folderId)),
  ];
}

function newSinceFinished(course, progress) {
  const finished = finishedAt(course, progress);
  if (finished === null) return [];
  const drafts = new Set((course.folders || []).filter((f) => f.status === "draft").map((f) => f.id));
  const visible = inDisplayOrder(course.pages || [], course.folders || []).filter((p) => p.status === "published" && !(p.folderId && drafts.has(p.folderId)));
  const watched = new Set(progress.completedPages || []);
  const results = progress.quizResults || [];
  const addedAfter = (p) => {
    const created = pageCreatedAt(p.id);
    return created !== null && created > finished;
  };
  const out = [];
  let lessonIsNew = false;
  for (const p of visible) {
    if (!p.isQuiz) {
      lessonIsNew = addedAfter(p);
      if (lessonIsNew && !watched.has(p.id)) out.push(p);
    } else if (lessonIsNew && addedAfter(p) && !passing(results.find((r) => r && r.pageId === p.id))) {
      out.push(p);
    }
  }
  return out;
}

function label(items) {
  const lessons = items.filter((p) => !p.isQuiz).length;
  const quizzes = items.filter((p) => p.isQuiz).length;
  const parts = [];
  if (lessons) parts.push(`${lessons} new lesson${lessons === 1 ? "" : "s"}`);
  if (quizzes) parts.push(`${quizzes} new ${quizzes === 1 ? "quiz" : "quizzes"}`);
  return parts.join(" and ");
}

(async () => {
  loadEnv();
  const send = process.argv.includes("--send");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("millerstorm");
  const scrub = excludedEmails();

  const courses = await db.collection("courses")
    .find({ status: "published" }, { projection: { id: 1, title: 1, folders: 1, "pages.id": 1, "pages.title": 1, "pages.status": 1, "pages.isQuiz": 1, "pages.isFinalTest": 1, "pages.folderId": 1 } })
    .toArray();
  // The same people the training board ranks: no deleted, suspended or flagged test accounts.
  const users = await db.collection("users")
    .find({ role: { $in: ["sales", "sales-team-lead"] }, deleted: { $ne: true }, suspended: { $ne: true }, testAccount: { $ne: true } }, { projection: { id: 1, name: 1, role: 1, email: 1 } })
    .toArray();
  const userById = new Map(users.filter((u) => !scrub.has(String(u.email || "").trim().toLowerCase())).map((u) => [u.id, u]));

  const plan = [];
  let unknownFinish = 0;
  for (const course of courses) {
    const finished = await db.collection("userprogresses")
      .find({ courseId: course.id, courseCompleted: true }, { projection: { userId: 1, courseCompleted: 1, completedPages: 1, quizResults: 1, pageCompletions: 1 } })
      .toArray();
    for (const progress of finished) {
      const user = userById.get(progress.userId);
      if (!user) continue;
      if (finishedAt(course, progress) === null) { unknownFinish++; continue; }
      const items = newSinceFinished(course, progress);
      if (!items.length) continue;
      const already = await db.collection("notifications").countDocuments({ userId: user.id, "metadata.reminder": REMINDER_KIND, "metadata.courseId": course.id });
      if (already) continue;
      const courseName = String(course.title || "").replace(/\s+/g, " ").trim();
      const one = items.length === 1;
      plan.push({
        user, items,
        doc: {
          id: `notif-newlessons-${course.id}-${user.id}`,
          userId: user.id,
          type: "course_added",
          title: "New lessons since you finished",
          // A quiz is taken, not watched.
          message: `${label(items)} ${one ? "was" : "were"} added to "${courseName}" after you finished it. ${items.some((p) => !p.isQuiz) ? "Watch" : "Take"} ${one ? "it" : "them"} to stay current.`,
          read: false,
          metadata: { courseId: course.id, courseName, watchUrl: trainingRoute(user.role), lessonId: items[0].id, reminder: REMINDER_KIND },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }
  }

  const byCourse = {};
  for (const p of plan) byCourse[p.doc.metadata.courseName] = (byCourse[p.doc.metadata.courseName] || 0) + 1;
  for (const p of plan) console.log(`${send ? "SEND" : "would send"}  ${p.user.name} | ${p.doc.metadata.courseName} | ${label(p.items)} | first: ${p.items[0].title}`);
  console.log(JSON.stringify({ mode: send ? "SEND" : "DRY RUN", reminders: plan.length, people: new Set(plan.map((p) => p.user.id)).size, skippedNoFinishTime: unknownFinish, byCourse }, null, 2));
  if (plan.length) console.log(`\nExample message:\n  ${plan[0].doc.title}\n  ${plan[0].doc.message}`);

  if (send && plan.length) {
    const r = await db.collection("notifications").insertMany(plan.map((p) => p.doc), { ordered: false });
    console.log(`created ${r.insertedCount} reminders`);
  }
  await client.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
