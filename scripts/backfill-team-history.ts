// scripts/backfill-team-history.ts
// One-off at deploy, BEFORE the first hourly step writes histories:
//   npx vite-node scripts/backfill-team-history.ts --snapshots <file.ndjson>[,<more.ndjson>] [--dry-run]
//
// Builds every RepCard rep's team history from the nightly-backup snapshots in
// docs/team-history/ (app users incl. deleted + RepCard directory, per night).
// 1. Seed from the 2026-09-23 night (first complete one), from 2026-01-01.
// 2. Apply the earlier moves Youssef decided on 2026-10-07 (EARLIER_MOVES).
// 3. Replay each later night; a change first seen in night N happened on N-1
//    (backups run 03:20 Central).
// Refuses to run if histories already exist, so it can never overwrite admin fixes.
import { readFileSync } from "fs";
import { connectMongo } from "../src/lib/mongodb";
import { RepTeamHistoryModel } from "../src/lib/models/RepTeamHistory";
import { buildOrgChart, repcardTeamMatcher } from "../src/lib/repcard/org-chart";
import { officeToBranch, BRANCH_ORDER } from "../src/lib/repcard/branches";
import { placeRep } from "../src/lib/teamhistory/placement";
import { advanceHistory, addPastMove, shiftDay, HISTORY_START, type Period, type Placement } from "../src/lib/teamhistory/periods";

const SEED_NIGHT = "2026-09-23";
// Decided 2026-10-07 (exact User Management dates; before them RepCard/the old
// roster is the only evidence of the earlier team). date = first day on the new team.
const EARLIER_MOVES: Array<{ name: string; date: string; earlier: Placement }> = [
  { name: "daniel reyes", date: "2026-09-16", earlier: { team: "Gunner McCullough", branch: "Fort Worth" } },
  { name: "preston taylor", date: "2026-09-16", earlier: { team: "Gunner McCullough", branch: "Fort Worth" } },
  { name: "jason nguyen", date: "2026-09-16", earlier: { team: "Gunner McCullough", branch: "Fort Worth" } },
  { name: "jose robles", date: "2026-09-16", earlier: { team: "Luke Huber", branch: "Fort Worth" } },
  { name: "kelvin burdiez", date: "2026-09-18", earlier: { team: "Jonathan Chambers", branch: "Fort Worth" } },
];

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] ?? "" : null; };
const clean = (s: string) => String(s || "").replace(/^❌\s*/, "").trim();

async function main() {
  const files = (arg("--snapshots") || "").split(",").filter(Boolean);
  const dryRun = process.argv.includes("--dry-run");
  if (!files.length) throw new Error("--snapshots <file>[,<file>] is required");
  const lines = files.flatMap((f) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l)));
  const nights = [...new Set(lines.filter((x) => x.k === "app" && x.d >= SEED_NIGHT).map((x) => x.d as string))].sort();
  if (nights[0] !== SEED_NIGHT) throw new Error(`no complete ${SEED_NIGHT} night in the snapshots`);

  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error("MONGODB_URI is not set. Refusing to connect to a default database."); process.exit(1); }
  try {
    const u = new URL(uri);
    console.log(`Target database: ${u.host}${u.pathname || "/"}`);
  } catch { console.log("Target database: (MONGODB_URI could not be parsed for display)"); }
  await connectMongo();
  if (!dryRun && (await RepTeamHistoryModel.estimatedDocumentCount()) > 0) {
    throw new Error("repteamhistories is not empty; refusing to overwrite.");
  }

  const histories = new Map<string, Period[]>();
  const meta = new Map<string, { name: string; email: string }>();

  for (const night of nights) {
    const app = lines.filter((x) => x.k === "app" && x.d === night);
    const rcs = lines.filter((x) => x.k === "rc" && x.d === night);
    const org = buildOrgChart(app.map((u: any) => ({ id: u.id, name: u.name, role: u.role, managerId: u.managerId, territory: u.territory, deleted: u.deleted })), BRANCH_ORDER, officeToBranch);
    const live = new Map<string, any>(), gone = new Map<string, any>();
    for (const u of app) if (u.email) (u.deleted ? gone : live).set(u.email, u);
    const matcher = repcardTeamMatcher(rcs.map((r: any) => ({ email: r.email, team: r.team, status: r.status })) as any, (e) => org.teamOf(live.get(e)), org.teams);
    const effective = night === SEED_NIGHT ? HISTORY_START : shiftDay(night, -1);
    for (const r of rcs) {
      const id = String(r.id);
      meta.set(id, { name: clean(r.name), email: r.email || "" });
      const p = placeRep({ org, live: live.get(r.email), former: gone.get(r.email), repcardTeam: r.team, repcardOffice: r.office, appTeamForRepCardTeam: matcher, officeToBranch });
      histories.set(id, advanceHistory(histories.get(id) || [], { team: p.team, branch: p.branch }, effective, night === SEED_NIGHT ? "initial" : "backup"));
    }
    if (night === SEED_NIGHT) {
      for (const m of EARLIER_MOVES) {
        const ids = [...meta].filter(([, v]) => v.name.toLowerCase() === m.name).map(([id]) => id);
        if (ids.length !== 1) throw new Error(`EARLIER_MOVES: "${m.name}" matched ${ids.length} RepCard reps`);
        histories.set(ids[0], addPastMove(histories.get(ids[0])!, m.date, m.earlier, nights[nights.length - 1], "backup"));
      }
    }
  }

  let moves = 0;
  for (const [id, periods] of histories) {
    if (periods.length < 2) continue;
    moves += periods.length - 1;
    console.log(meta.get(id)?.name, "|", periods.map((p) => `${p.team || "(no team)"} ${p.from}..${p.to ?? "now"}`).join("  ->  "));
  }
  console.log(`${histories.size} reps, ${moves} moves${dryRun ? " (dry run, nothing written)" : ""}`);
  if (dryRun) process.exit(0);

  await RepTeamHistoryModel.insertMany([...histories].map(([id, periods]) => ({
    repcardUserId: id, repName: meta.get(id)?.name || "", repEmail: (meta.get(id)?.email || "").toLowerCase(), periods, version: 1,
  })));
  console.log("written");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
