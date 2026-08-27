// fix-legacy-branch-and-name.js
//
// One-off cleanup of three user records, found on 2026-08-27 while building the
// RepCard drift warning in User Management.
//
//   1+2. Sergio Flores and Fernando Cano still carry Branch values from the old
//        multi-select territory UI ("West Texas · DFW, Texas"). They name the
//        right branch, but the stray text is not one of the three options the
//        Branch picker offers, so the field reads as junk on screen and needs
//        special-casing everywhere it is compared.
//   3.   Declan Mathison is misspelled "Delcan" on his account. That matters
//        beyond tidiness: the role dashboards, training leaderboard and
//        Scoreboard resolve a rep's team from their NAME, and the misspelling
//        matches nothing, so he resolves to no team on those screens.
//
// Verified before writing: no other collection stores a copy of the misspelled
// name (notifications, progress and leaderboard snapshots all key off userId,
// which is unchanged), so the rename is safe.
//
// DELIBERATELY NOT TOUCHED: Declan's and Johnny Franco's Branch/Team, which
// genuinely disagree with RepCard rather than being malformed. Those are for a
// human to decide -- that is what the new warning is for. Nadine Adams' legacy
// value ("DFW, Texas · Lubbock, Texas · Round Rock, Texas · Other") names no
// branch at all, so there is nothing to clean it to without guessing.
//
// Dry run by default. Add --apply to write:
//   node fix-legacy-branch-and-name.js
//   node fix-legacy-branch-and-name.js --apply

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

function loadEnv() {
  const p = path.join(__dirname, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

// Each edit names the EXACT value it expects to find, so a re-run after the fact
// is a no-op and the script can never overwrite a value someone has since changed.
const EDITS = [
  {
    email: "sergio.flores@millerstorm.com",
    expect: { territory: "West Texas · DFW, Texas" },
    set: { territory: "West Texas", branches: ["West Texas"] },
  },
  {
    email: "fernando.cano@millerstorm.com",
    expect: { territory: "Fort Worth · DFW, Texas" },
    set: { territory: "Fort Worth", branches: ["Fort Worth"] },
  },
  {
    email: "declan.mathison@millerstorm.com",
    expect: { name: "Delcan Mathison" },
    set: { name: "Declan Mathison" },
  },
];

(async () => {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (checked the environment and .env).");

  await mongoose.connect(uri);
  const users = mongoose.connection.collection("users");

  console.log(apply ? "APPLYING CHANGES\n" : "DRY RUN (pass --apply to write)\n");

  let changed = 0;
  let skipped = 0;
  for (const edit of EDITS) {
    const doc = await users.findOne({ email: edit.email, deleted: { $ne: true } });
    if (!doc) {
      console.log(`SKIP  ${edit.email}: no active user with that email`);
      skipped++;
      continue;
    }

    const mismatched = Object.entries(edit.expect).filter(([k, v]) => doc[k] !== v);
    if (mismatched.length > 0) {
      console.log(`SKIP  ${doc.name} <${edit.email}>: already changed or unexpected value`);
      for (const [k, v] of mismatched) {
        console.log(`        ${k}: expected ${JSON.stringify(v)}, found ${JSON.stringify(doc[k])}`);
      }
      skipped++;
      continue;
    }

    console.log(`FIX   ${doc.name} <${edit.email}>`);
    for (const [k, v] of Object.entries(edit.set)) {
      console.log(`        ${k}: ${JSON.stringify(doc[k])}  ->  ${JSON.stringify(v)}`);
    }
    if (apply) await users.updateOne({ _id: doc._id }, { $set: edit.set });
    changed++;
  }

  console.log(`\n${apply ? "Changed" : "Would change"}: ${changed}   Skipped: ${skipped}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
