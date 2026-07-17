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
      // Targeted field updates via arrayFilters instead of rebuilding and
      // $set-ing the whole `pages` array. A whole-array $set is a
      // read-modify-write over a stale in-memory snapshot: any concurrent
      // Course Builder edit to a page's title/video/body between our find()
      // and this write would be silently overwritten (lost update). Flipping
      // only the isFinalTest field on the matched array elements leaves every
      // other field — and any concurrent edit to it — untouched. Do not
      // "simplify" this back into a single $set: { pages }.
      await courses.updateOne(
        { _id: c._id },
        { $set: { "pages.$[f].isFinalTest": true } },
        { arrayFilters: [{ "f.id": finalId }] }
      );
      await courses.updateOne(
        { _id: c._id },
        { $set: { "pages.$[o].isFinalTest": false } },
        { arrayFilters: [{ "o.id": { $ne: finalId } }] }
      );
    }
  }
  console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"} — ${flagged}/${all.length} courses flagged`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
