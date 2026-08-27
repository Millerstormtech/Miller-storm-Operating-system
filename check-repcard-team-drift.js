// check-repcard-team-drift.js
//
// Reports where ROSTER in src/lib/repcard/org-chart.ts has drifted from RepCard.
//
// RepCard is the source of truth for team membership, and the sales leaderboard
// follows it directly. But the role dashboards, the training leaderboard and the
// Scoreboard call resolveTeam() with a NAME only -- they have no RepCard record
// to pass -- so they fall back to ROSTER. When ROSTER disagrees with RepCard,
// those screens disagree with the sales leaderboard.
//
// Run this after any team shuffle, then update ROSTER to match:
//   node check-repcard-team-drift.js
//
// Reads MONGODB_URI from .env. To point it at production over an SSH tunnel:
//   ssh -L 27018:localhost:27017 root@millerstorm.tech -N
//   MONGODB_URI="mongodb://user:pass@127.0.0.1:27018/millerstorm?authSource=admin" node check-repcard-team-drift.js

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

(async () => {
  loadEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (checked the environment and .env).");

  // org-chart.ts is pure and import-free, so Node can load it directly and we
  // never have to copy the roster into this script and let it rot.
  const { resolveTeam } = await import("./src/lib/repcard/org-chart.ts");

  await mongoose.connect(uri);
  const reps = await mongoose.connection
    .collection("repcardusers")
    .find({})
    .project({ name: 1, team: 1, office: 1, status: 1 })
    .toArray();

  const drift = [];
  const unplaced = [];
  for (const r of reps) {
    if (String(r.status || "").toUpperCase() !== "ACTIVE") continue;
    const fromRepCard = resolveTeam(r.name, r.team); // what the sales leaderboard shows
    const fromRoster = resolveTeam(r.name);          // what the name-only screens show
    if (!fromRepCard) {
      unplaced.push(r);
    } else if (fromRepCard !== fromRoster) {
      drift.push({ name: r.name, repcard: r.team, board: fromRepCard, roster: fromRoster || "(not in ROSTER)" });
    }
  }

  console.log(`Active RepCard reps: ${reps.filter((r) => String(r.status || "").toUpperCase() === "ACTIVE").length}`);

  if (drift.length === 0) {
    console.log("\nNo drift: ROSTER agrees with RepCard for every active rep.");
  } else {
    console.log(`\nDRIFT (${drift.length}) -- update ROSTER in src/lib/repcard/org-chart.ts to match the "board" column:`);
    for (const d of drift) {
      console.log(`  ${d.name.padEnd(24)} RepCard="${d.repcard}" -> board=${d.board.padEnd(15)} ROSTER says=${d.roster}`);
    }
  }

  if (unplaced.length > 0) {
    console.log(`\nNo team resolved (${unplaced.length}) -- expected for non-sales "Management" accounts:`);
    for (const u of unplaced) console.log(`  ${u.name.padEnd(24)} team="${u.team}" office="${u.office}"`);
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
