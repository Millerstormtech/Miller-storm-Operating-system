// scripts/canvass-parker-age.ts
// Fills in Parker County's year built from Parker CAD's public property pages,
// one house at a time (rules in src/lib/canvass/parkerCad.ts). Parker CAD
// publishes no bulk file with the year; its pages show it. Youssef, 8 Oct 2026:
// read the pages slowly.
//
//   npx vite-node scripts/canvass-parker-age.ts                          the first pass, ~62,000 pages
//   npx vite-node scripts/canvass-parker-age.ts --max 300 --newest-first the daily top-up
//
// Options:
//   --uri <mongodb>     database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote      required to write to anything but the local test database
//   --max <n>           read at most n pages this run, default all that are left
//   --delay-ms <n>      pause between pages, default 2000 (one page every ~2 seconds)
//   --newest-first      newest houses first (the daily top-up, so it never races the first pass)
//   --dry-run           read and count only, write nothing
//
// Resumable: each house read gets yearBuiltCheckedAt, and only houses without it
// are read, so a stopped run simply starts again where it was. Stops early,
// writing what it has, when the site refuses (HTTP 403, 429 or 503) or after
// 10 failures in a row; then it prints SKIPPED and exits with PARTIAL_EXIT_CODE
// so the daily refresh carries on. At the end it refreshes Parker's county
// quality row. Prints counts only; owner names on the pages are never read.

import mongoose from "mongoose";
import { PARTIAL_EXIT_CODE } from "../src/lib/canvass/dailyRun";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { PARKER_FIPS, PARKER_PAGE, parkerBuildings, parkerPageId } from "../src/lib/canvass/parkerCad";
import { countyFlags, suggestedStatus } from "../src/lib/canvass/quality";
import { CanvassHomeModel } from "../src/lib/models/CanvassHome";
import { CanvassCountyQualityModel } from "../src/lib/models/CanvassCountyQuality";

type Options = { uri: string; allowRemote: boolean; max: number; delayMs: number; newestFirst: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { uri: "mongodb://127.0.0.1:27017/millerstorm", allowRemote: false, max: Infinity, delayMs: 2000, newestFirst: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--max") options.max = Number(argv[++i]);
    else if (arg === "--delay-ms") options.delayMs = Number(argv[++i]);
    else if (arg === "--newest-first") options.newestFirst = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!(options.max > 0)) throw new Error("--max must be a positive number");
  if (!Number.isFinite(options.delayMs) || options.delayMs < 500) throw new Error("--delay-ms must be 500 or more (be gentle with Parker CAD's site)");
  return options;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const USER_AGENT = "Mozilla/5.0 (compatible; MillerStormCanvassMap/1.0; property year lookup, one page every few seconds)";
const MAX_FAILURES_IN_A_ROW = 10;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.dryRun && !options.allowRemote && !isLocalTestDatabase(options.uri)) {
    throw new Error("Refusing to write to a database that is not the local test database. Pass --allow-remote on purpose.");
  }
  await mongoose.connect(options.uri);
  const thisYear = new Date().getUTCFullYear();

  const left = await CanvassHomeModel.countDocuments({ fips: PARKER_FIPS, yearBuiltCheckedAt: null });
  const homes = (await CanvassHomeModel.find({ fips: PARKER_FIPS, yearBuiltCheckedAt: null }, { propId: 1 })
    .sort({ _id: options.newestFirst ? -1 : 1 })
    .limit(Number.isFinite(options.max) ? options.max : 0)
    .lean()) as Array<{ _id: unknown; propId: string }>;
  console.log(`[parker-age] ${left} Parker houses not read yet; reading ${homes.length} now, one page every ${options.delayMs / 1000} s`);

  const counts = { read: 0, withYear: 0, mobileHomes: 0, noYear: 0, notOnSite: 0, badId: 0 };
  let failuresInARow = 0;
  let stopped = "";
  const started = Date.now();
  for (const home of homes) {
    const id = parkerPageId(home.propId);
    if (!id) {
      counts.badId++;
      if (!options.dryRun) await CanvassHomeModel.updateOne({ _id: home._id }, { $set: { yearBuiltCheckedAt: new Date() } });
      continue;
    }
    let html = "";
    try {
      const response = await fetch(`${PARKER_PAGE}${id}`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
      if (response.status === 403 || response.status === 429 || response.status === 503) {
        stopped = `Parker CAD's site answered HTTP ${response.status} (it may be limiting us); stopped after ${counts.read} pages`;
        break;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      html = await response.text();
      failuresInARow = 0;
    } catch (error) {
      failuresInARow++;
      if (failuresInARow >= MAX_FAILURES_IN_A_ROW) {
        stopped = `${MAX_FAILURES_IN_A_ROW} page reads failed in a row (last: ${error instanceof Error ? error.message : error}); stopped after ${counts.read} pages`;
        break;
      }
      await sleep(options.delayMs * 3);
      continue;
    }

    const page = parkerBuildings(html, thisYear);
    counts.read++;
    if (!page.found) counts.notOnSite++;
    else if (page.yearBuilt !== null) counts.withYear++;
    else counts.noYear++;
    if (page.mobileHome) counts.mobileHomes++;
    if (!options.dryRun) {
      const set: Record<string, unknown> = { yearBuiltCheckedAt: new Date() };
      if (page.yearBuilt !== null) Object.assign(set, { yearBuilt: page.yearBuilt, yearBuiltSource: "parkercad" });
      await CanvassHomeModel.updateOne({ _id: home._id }, { $set: set });
    }
    if (counts.read % 500 === 0) {
      const perHour = Math.round((counts.read / (Date.now() - started)) * 3_600_000);
      console.log(`[parker-age]   ${counts.read} of ${homes.length} read (${counts.withYear} with a year), about ${perHour} an hour`);
    }
    await sleep(options.delayMs);
  }

  // Parker's county quality row: the year-built share and flags, recounted.
  if (!options.dryRun) {
    const withYearBuilt = await CanvassHomeModel.countDocuments({ fips: PARKER_FIPS, yearBuilt: { $ne: null } });
    const builtBefore1990 = await CanvassHomeModel.countDocuments({ fips: PARKER_FIPS, yearBuilt: { $lt: 1990 } });
    const row = (await CanvassCountyQualityModel.findOne({ fips: PARKER_FIPS }).sort({ importedAt: -1 }).lean()) as Record<string, any> | null;
    if (row) {
      const flags = countyFlags({
        homes: row.homes,
        withYearBuilt,
        builtBefore1990,
        withOwnerSignal: row.withOwnerSignal,
        ownerLivesHere: row.ownerLivesHere,
        withHomesteadSignal: row.withHomesteadSignal,
        records: row.parcelsRead,
        idConflicts: row.idConflicts,
      });
      await CanvassCountyQualityModel.updateOne(
        { _id: row._id },
        { $set: { withYearBuilt, builtBefore1990, flags, suggestedStatus: suggestedStatus(flags) }, $addToSet: { extraSources: "parkercad" } }
      );
      console.log(`[parker-age] Parker now has a year on ${withYearBuilt} of ${row.homes} houses; flags: ${flags.join(", ") || "none"}`);
    }
  }

  console.log(
    `[parker-age] ${options.dryRun ? "DRY RUN: " : ""}${counts.read} pages read in ${((Date.now() - started) / 60000).toFixed(1)} min: ` +
      `${counts.withYear} with a year (${counts.mobileHomes} mobile homes in all), ${counts.noYear} without one, ${counts.notOnSite} not on the site, ${counts.badId} with no usable id`
  );
  await mongoose.disconnect();
  if (stopped) {
    console.log(`[parker-age] SKIPPED the rest of the Parker year lookup: ${stopped}`);
    process.exitCode = PARTIAL_EXIT_CODE;
  }
}

main().catch(async (error) => {
  console.error("[parker-age] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
