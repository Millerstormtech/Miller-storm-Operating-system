// One-off: rename the Tier 1 course category after Jay dropped the word
// "Diploma" on 2026-08-19.
//
//   "Miller Storm Diploma"  ->  "Miller Storm Certificate"
//
// The category string stored on each Course document is the ONLY link between
// a course and its credential (see src/lib/training/credentials.ts). Renaming
// the constant without renaming the stored values would leave every Tier 1
// course matching nothing: the Training Center would file them under "Other
// Courses" and every rep's Miller Storm bar would read 0%.
//
// Safe to run more than once. A no-op if no document carries the old value.
//
//   node scripts/rename-diploma-category.js           # report only
//   node scripts/rename-diploma-category.js --apply   # write

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const OLD = "Miller Storm Diploma";
const NEW = "Miller Storm Certificate";
const APPLY = process.argv.includes("--apply");

function loadEnv() {
  const file = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

(async () => {
  loadEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Add it to .env or pass it in the environment.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  const courses = mongoose.connection.collection("courses");

  const affected = await courses.find({ category: OLD }).project({ id: 1, title: 1 }).toArray();
  console.log(`courses carrying "${OLD}": ${affected.length}`);
  for (const c of affected) console.log(`  ${c.id}  ${c.title || ""}`);

  // Anything already renamed, so a second run reports honestly rather than
  // looking like it found nothing to do.
  const already = await courses.countDocuments({ category: NEW });
  console.log(`courses already on "${NEW}": ${already}`);

  if (!APPLY) {
    console.log("\nreport only. Re-run with --apply to write.");
  } else if (affected.length === 0) {
    console.log("\nnothing to change.");
  } else {
    const res = await courses.updateMany({ category: OLD }, { $set: { category: NEW } });
    console.log(`\nupdated ${res.modifiedCount} course(s).`);
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
