// scripts/canvass-grade.ts
// Grades every Canvass Map house (plan T5.1): gathers its facts (year built,
// owner, hail, the RepCard doors and AccuLynx jobs matched to it, its county's
// quality flags, the latest AccuLynx signing next door) and stores gradeHome()'s
// score, color and reasons on the house.
//
//   npx vite-node scripts/canvass-grade.ts
//
// Options:
//   --today <YYYY-MM-DD>   the day to grade for, default today in Texas (Central time)
//   --fips <code>          one county only, e.g. 48439
//   --uri <mongodb>        database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote         required to write to anything but the local test database
//   --dry-run              count only, write nothing
//
// Run after the house import, the hail step, the door and job matching and the
// signing dates (scripts/canvass-jobs-signed.ts). Prints counts only.

import mongoose from "mongoose";
import { GRADE } from "../src/lib/canvass/config";
import { gradeHome, type Color } from "../src/lib/canvass/grade";
import { homeFacts, type StoredDoor } from "../src/lib/canvass/facts";
import { buildSigningIndex, latestSigningNear, type Signing } from "../src/lib/canvass/neighbours";
import { centralDay, daysBetween } from "../src/lib/canvass/dates";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { SERVICE_COUNTIES } from "../src/lib/canvass/counties";
import { CanvassHomeModel } from "../src/lib/models/CanvassHome";
import { CanvassDoorModel } from "../src/lib/models/CanvassDoor";
import { CanvassJobModel } from "../src/lib/models/CanvassJob";
import { CanvassCountyQualityModel } from "../src/lib/models/CanvassCountyQuality";

const BATCH_SIZE = 5000;
const QUALITY_SOURCE = "txgio-2025";

type Options = { today: string; fips: string; uri: string; allowRemote: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { today: centralDay(new Date()) ?? "", fips: "", uri: "mongodb://127.0.0.1:27017/millerstorm", allowRemote: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--today") options.today = argv[++i] ?? "";
    else if (arg === "--fips") options.fips = argv[++i] ?? "";
    else if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.today)) throw new Error("--today must be YYYY-MM-DD");
  return options;
}

const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value ?? ""));

type StoredDoorDocument = {
  homeId: unknown;
  status?: string;
  statusAt?: Date | null;
  knocks?: Array<{ at: Date; status: string; userId: number | null; rep: string; verified: boolean }>;
  statusChanges?: Array<{ at: Date; from: string; to: string; userId: number | null; rep: string }>;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isLocalTestDatabase(options.uri) && !options.allowRemote) {
    throw new Error("Refusing to write to anything but the local test database. Pass --allow-remote only when approved.");
  }
  await mongoose.connect(options.uri);

  const flagsByFips = new Map<string, string[]>();
  for (const row of (await CanvassCountyQualityModel.find({ source: QUALITY_SOURCE }, { fips: 1, flags: 1 }).lean()) as Array<{ fips: string; flags?: string[] }>) {
    flagsByFips.set(row.fips, row.flags ?? []);
  }

  const doorsByHome = new Map<string, StoredDoor[]>();
  const doorCursor = CanvassDoorModel.find({ homeId: { $ne: null } }, { homeId: 1, status: 1, statusAt: 1, knocks: 1, statusChanges: 1 }).lean().cursor();
  for await (const door of doorCursor as AsyncIterable<StoredDoorDocument>) {
    const homeId = String(door.homeId);
    const list = doorsByHome.get(homeId) ?? [];
    list.push({
      status: door.status ?? "",
      statusAt: door.statusAt ? iso(door.statusAt) : null,
      knocks: (door.knocks ?? []).map((k) => ({ ...k, at: iso(k.at) })),
      statusChanges: (door.statusChanges ?? []).map((c) => ({ ...c, at: iso(c.at) })),
    });
    doorsByHome.set(homeId, list);
  }

  // milestoneAt comes too: a finished job stops keeping the house red after
  // GRADE.closedJobBlocksYears (jobBlocksKnocking in canvass/jobs.ts).
  const jobsByHome = new Map<string, Array<{ milestone: string; milestoneAt: string | null }>>();
  const jobCursor = CanvassJobModel.find({ homeId: { $ne: null } }, { homeId: 1, milestone: 1, milestoneAt: 1 }).lean().cursor();
  for await (const job of jobCursor as AsyncIterable<{ homeId: unknown; milestone?: string; milestoneAt?: Date | null }>) {
    const homeId = String(job.homeId);
    const list = jobsByHome.get(homeId) ?? [];
    list.push({ milestone: job.milestone ?? "", milestoneAt: job.milestoneAt ? job.milestoneAt.toISOString() : null });
    jobsByHome.set(homeId, list);
  }

  // AccuLynx signings, placed at the house each signed job matched, for the neighbour bonus.
  const signedJobs = (await CanvassJobModel.find({ homeId: { $ne: null }, signedAt: { $ne: null } }, { homeId: 1, signedAt: 1 }).lean()) as Array<{
    homeId: unknown;
    signedAt: Date;
  }>;
  const signedHomeSpots = new Map<string, [number, number]>();
  for (const home of (await CanvassHomeModel.find({ _id: { $in: signedJobs.map((job) => job.homeId) } }, { location: 1 }).lean()) as Array<{
    _id: unknown;
    location: { coordinates: [number, number] };
  }>) {
    signedHomeSpots.set(String(home._id), home.location.coordinates);
  }
  const signings: Signing[] = [];
  for (const job of signedJobs) {
    const spot = signedHomeSpots.get(String(job.homeId));
    const day = centralDay(job.signedAt);
    if (!spot || !day || day > options.today) continue;
    signings.push({ homeId: String(job.homeId), lat: spot[1], lng: spot[0], day });
  }
  const signingIndex = buildSigningIndex(signings);
  console.log(
    `[grade] grading for ${options.today}: ${doorsByHome.size} houses with RepCard doors, ${jobsByHome.size} houses with AccuLynx jobs, ${signings.length} AccuLynx signings placed on houses`
  );

  type Tally = Record<Color, number> & { homes: number; forced: number; knocked: number; neighbourBonus: number };
  const tallies = new Map<string, Tally>();
  const tallyFor = (fips: string) => {
    if (!tallies.has(fips)) tallies.set(fips, { homes: 0, green: 0, yellow: 0, orange: 0, red: 0, forced: 0, knocked: 0, neighbourBonus: 0 });
    return tallies.get(fips)!;
  };

  let batch: Array<{ updateOne: { filter: { _id: unknown }; update: object } }> = [];
  const flush = async () => {
    if (batch.length === 0) return;
    if (!options.dryRun) await CanvassHomeModel.bulkWrite(batch as never, { ordered: false });
    batch = [];
  };

  const filter = options.fips ? { fips: options.fips } : {};
  const homeCursor = CanvassHomeModel.find(filter, { fips: 1, location: 1, yearBuilt: 1, ownerLivesHere: 1, hail: 1 }).lean().cursor();
  let graded = 0;
  for await (const home of homeCursor as AsyncIterable<{
    _id: unknown;
    fips: string;
    location: { coordinates: [number, number] };
    yearBuilt?: number | null;
    ownerLivesHere?: boolean | null;
    hail?: Array<{ date: string; inches: number }>;
  }>) {
    const homeId = String(home._id);
    const [lng, lat] = home.location.coordinates;
    const neighborSignedAt = latestSigningNear(signingIndex, { id: homeId, lat, lng }, GRADE.neighborSigned.radiusMeters);
    const facts = homeFacts({
      yearBuilt: home.yearBuilt ?? null,
      ownerLivesHere: home.ownerLivesHere ?? null,
      hail: home.hail ?? [],
      countyFlags: flagsByFips.get(home.fips) ?? [],
      doors: doorsByHome.get(homeId) ?? [],
      jobs: jobsByHome.get(homeId) ?? [],
      neighborSignedAt,
    }, options.today);
    const grade = gradeHome(facts, options.today);
    const tally = tallyFor(home.fips);
    tally.homes++;
    tally[grade.color]++;
    if (grade.forced) tally.forced++;
    if (facts.knocks.length > 0) tally.knocked++;
    if (neighborSignedAt && daysBetween(neighborSignedAt, options.today) <= GRADE.neighborSigned.withinDays) tally.neighbourBonus++;
    batch.push({ updateOne: { filter: { _id: home._id }, update: { $set: { grade, gradedOn: options.today } } } });
    graded++;
    if (batch.length >= BATCH_SIZE) await flush();
    if (graded % 500000 === 0) console.log(`[grade] ${graded} houses graded`);
  }
  await flush();

  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
  for (const county of SERVICE_COUNTIES) {
    const t = tallies.get(county.fips);
    if (!t) continue;
    console.log(
      `[grade] ${county.area} ${county.name}: ${t.homes} houses; green ${pct(t.green, t.homes)}, yellow ${pct(t.yellow, t.homes)}, ` +
        `orange ${pct(t.orange, t.homes)}, red ${pct(t.red, t.homes)} (forced ${t.forced}); knocked by us ${t.knocked}; neighbour signed in 90 days ${t.neighbourBonus}`
    );
  }
  console.log(`[grade] done: ${graded} houses ${options.dryRun ? "counted" : "graded"} for ${options.today}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[grade] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
