// Read-only health check: does every published course still belong to a
// credential on the Course Leaderboard?
//
// A course is joined to its credential by the `category` STRING stored on the
// course document, matched character for character (src/lib/training/
// credentials.ts). That same string is also the Training Center's visible
// section heading, so one innocent edit to a heading unhooks a credential. It
// cannot raise an error. The bar simply reads 0% for every rep while their
// progress sits untouched in the courses.
//
// That is exactly what happened on 2026-08-20: five published courses were
// filed under "Millionaire Knockers" and "Roof Hustlers" while CREDENTIALS was
// matching on "Matt Mulholland Certificate" and "DeShaun Bryant (Roof Hustlers)
// Certificate". Two of the three bars read 0% for everybody, silently.
//
// Exits 1 when a published course carries a category no credential recognises,
// or when a credential holds no published course at all. RUN THIS AFTER ANY
// DEPLOY THAT RENAMES A CATEGORY, and after scripts/rename-diploma-category.js.
//
//   node scripts/check-credential-categories.js
//
// Never writes. Safe to run against production.

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// Kept in step with src/lib/training/credentials.ts by credentials.test.ts.
// Duplicated here rather than imported because this is plain CommonJS run by
// node against a live database, the same way the other scripts/ files are.
const CREDENTIALS = [
  { key: "certificate", category: "Miller Storm Certificate", label: "Miller Storm Certificate" },
  { key: "knockers", category: "Millionaire Knockers", label: "Millionaire Knockers" },
  { key: "hustlers", category: "Roof Hustlers", label: "Roof Hustlers" },
];

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
  const courses = await mongoose.connection
    .collection("courses")
    .find({ status: "published" })
    .project({ id: 1, title: 1, category: 1 })
    .toArray();

  const known = new Set(CREDENTIALS.map((c) => c.category));
  const byCategory = new Map();
  for (const c of courses) {
    const cat = (c.category || "").trim();
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(c);
  }

  let bad = false;

  console.log(`published courses: ${courses.length}\n`);
  for (const cred of CREDENTIALS) {
    const mine = byCategory.get(cred.category) || [];
    console.log(`${mine.length ? "OK  " : "FAIL"}  ${cred.label}: ${mine.length} course(s)`);
    for (const c of mine) console.log(`        ${c.title || c.id}`);
    // An empty credential is not proof of a rename, an admin may still be
    // filling it in, but on this board it always shows as a 0% bar, so it is
    // worth failing on rather than discovering from a rep.
    if (mine.length === 0) bad = true;
  }

  // Uncategorised is a normal state: those courses land in "Other Courses" and
  // count towards the overall bar, just not towards a credential.
  const loose = byCategory.get("") || [];
  if (loose.length) console.log(`\nuncategorised (fine, no credential): ${loose.length} course(s)`);

  const orphans = [...byCategory.keys()].filter((k) => k && !known.has(k)).sort();
  if (orphans.length) {
    bad = true;
    console.log("\nORPHANED CATEGORIES: carried by a published course, matched by no credential.");
    console.log("These courses count towards the overall bar but towards NO credential bar.");
    for (const cat of orphans) {
      console.log(`  ${JSON.stringify(cat)}  (${byCategory.get(cat).length} course(s))`);
      for (const c of byCategory.get(cat)) console.log(`        ${c.title || c.id}`);
    }
  }

  await mongoose.disconnect();

  if (bad) {
    console.log(
      "\nFAILED. Either fix the stored category on those courses, or point\n" +
        "src/lib/training/credentials.ts at the strings the courses actually carry.\n" +
        "Until then the affected bars read 0% for every rep, with no error."
    );
    process.exit(1);
  }
  console.log("\nOK. Every credential holds courses and no published course is orphaned.");
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
