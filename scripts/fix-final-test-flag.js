// Marks every page titled "Final Test" as an actual final test.
//
// The Course Builder writes the page title but never sets `isFinalTest`, so
// every one of these pages sat with the flag false. Found 2026-08-25: ten
// courses had a page called "Final Test" and NOT ONE was flagged, which meant
// the flag had never been true anywhere in the database.
//
// What the flag does, and does not do (src/lib/training/scoring.ts):
//   - It does NOT affect course completion. `complete` counts every page with
//     `isQuiz`, and a Final Test already carries that, so it was always
//     required to finish a course. Flipping this flag takes nothing away from
//     anybody and cannot invalidate an issued certificate.
//   - It DOES enable `finalTestPerfect`, which feeds the "Test Ace" badge on
//     the Course Leaderboard. Without it, `finalTestId` is null and a rep who
//     scored 100% on the final test could never earn that badge.
//
// Also trims trailing whitespace from the title. Two courses stored it as
// "Final Test " with a trailing space, which no exact-match check would find.
//
// Safe to run more than once, and worth re-running after new courses are
// built: the Course Builder still does not set the flag, so this is the fix
// until it does.
//
//   node scripts/fix-final-test-flag.js           # report only
//   node scripts/fix-final-test-flag.js --apply   # write

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// Trimmed, case insensitive, and tolerant of "FinalTest" with no space. The
// title is typed by hand in the Course Builder, so it is not a reliable key
// without normalising first.
const IS_FINAL_TEST = /^final\s*test$/i;
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
  const docs = await courses.find({}, { projection: { title: 1, pages: 1 } }).toArray();

  let flags = 0;
  let trims = 0;
  for (const c of docs) {
    for (let i = 0; i < (c.pages || []).length; i++) {
      const p = c.pages[i];
      const title = String(p.title || "");
      if (!IS_FINAL_TEST.test(title.trim())) continue;

      const set = {};
      if (p.isFinalTest !== true) {
        set[`pages.${i}.isFinalTest`] = true;
        flags++;
      }
      if (title !== title.trim()) {
        set[`pages.${i}.title`] = title.trim();
        trims++;
      }
      if (!Object.keys(set).length) continue;

      console.log(
        `  ${String(c.title || "").slice(0, 40).padEnd(42)} page ${i + 1}  ${Object.keys(set).join(", ")}`
      );
      if (APPLY) await courses.updateOne({ _id: c._id }, { $set: set });
    }
  }

  console.log("");
  console.log(`flags to set: ${flags}   titles to trim: ${trims}`);
  console.log(APPLY ? "applied." : "report only. Re-run with --apply to write.");
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
