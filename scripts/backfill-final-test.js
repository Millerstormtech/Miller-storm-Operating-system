// One-time migration: flag each course's "Final Test" page with isFinalTest.
// Idempotent — safe to run repeatedly. Usage:
//   node scripts/backfill-final-test.js          (report only, writes nothing)
//   node scripts/backfill-final-test.js --apply  (writes)
require("dotenv").config();
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const courses = mongoose.connection.collection("courses");
  const all = await courses.find({ status: "published" }).toArray();

  let flagged = 0;
  for (const c of all) {
    const quizzes = (c.pages || []).filter((p) => p.isQuiz);
    const finals = quizzes.filter((p) => String(p.title || "").trim().toLowerCase() === "final test");

    if (finals.length !== 1) {
      console.log(`!! ${c.title}: expected exactly 1 "Final Test", found ${finals.length} — SKIPPED`);
      continue;
    }
    const finalId = finals[0].id;
    console.log(`   ${c.title}: "${finals[0].title}" -> isFinalTest`);
    flagged++;

    if (APPLY) {
      const pages = (c.pages || []).map((p) => ({ ...p, isFinalTest: p.id === finalId }));
      await courses.updateOne({ _id: c._id }, { $set: { pages } });
    }
  }
  console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"} — ${flagged}/${all.length} courses flagged`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
