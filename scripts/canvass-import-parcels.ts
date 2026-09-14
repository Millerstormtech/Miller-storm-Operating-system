// scripts/canvass-import-parcels.ts
// Loads one county's houses from the Texas state property file (TxGIO Land
// Parcels) into the Knock Planner, and records that county's data-quality row.
//
//   npx vite-node scripts/canvass-import-parcels.ts --folder D:/knock-planner/data/parcels/48219
//
// Options:
//   --folder <path>   an extracted county zip (the importer finds the .shp inside)
//   --source <name>   label for this import, default "txgio-2025"
//   --uri <mongodb>   database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote    required to write to any database not on this computer
//   --dry-run         read and count only, write nothing
//
// Safety: it refuses a non-local database unless --allow-remote is given, and it
// never reads MONGODB_URI, so the live database in .env cannot be hit by accident.
// It prints counts only, never owner names or addresses.
//
// One property id can appear on several records (Hockley 2025: 101 ids, 189
// extra records, same address and year built each time). Records are merged per
// id before anything is written, so the quality counts describe the same houses
// the map shows.
//
// The state download site blocks scripts, so county zips are downloaded in a
// browser and unzipped first (spec B3).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import mongoose from "mongoose";
import { parcelToHome, mergeHomes, type HomeRecord, type HomePiece } from "../src/lib/canvass/parcel";
import { outlineArea, type PolygonGeometry } from "../src/lib/canvass/geometry";
import { SERVICE_COUNTIES, isServiceCounty } from "../src/lib/canvass/counties";
import { countyFlags, suggestedStatus, type CountyStats } from "../src/lib/canvass/quality";
import { CanvassHomeModel } from "../src/lib/models/CanvassHome";
import { CanvassCountyQualityModel } from "../src/lib/models/CanvassCountyQuality";

// Loaded through Node's own require on purpose. Under vite-node an ES import of
// `shapefile` picks the build that opens paths with fetch(), which fails on a
// local file ("fetch failed"). The CommonJS build reads from disk.
const shapefile: typeof import("shapefile") = createRequire(import.meta.url)("shapefile");

const BATCH_SIZE = 2000;

type Options = { folder: string; source: string; uri: string; allowRemote: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = {
    folder: "",
    source: "txgio-2025",
    uri: "mongodb://127.0.0.1:27017/millerstorm",
    allowRemote: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--folder") options.folder = argv[++i] ?? "";
    else if (arg === "--source") options.source = argv[++i] ?? options.source;
    else if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.folder) throw new Error("--folder is required");
  return options;
}

function assertLocalUnlessAllowed(uri: string, allowRemote: boolean): void {
  const hosts = uri.replace(/^mongodb(\+srv)?:\/\//, "").split("/")[0].split("@").pop() ?? "";
  const local = hosts.split(",").every((host) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host));
  if (!local && !allowRemote) {
    throw new Error("Refusing to write to a database that is not on this computer. Pass --allow-remote only when approved.");
  }
}

function findFile(dir: string, extension: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, extension);
      if (found) return found;
    } else if (entry.name.toLowerCase().endsWith(extension)) {
      return full;
    }
  }
  return null;
}

type RunStats = CountyStats & { parcelsRead: number; repeatedRecords: number; taxYear: string };

function emptyStats(): RunStats {
  return { parcelsRead: 0, repeatedRecords: 0, homes: 0, withYearBuilt: 0, builtBefore1990: 0, withOwnerSignal: 0, ownerLivesHere: 0, taxYear: "" };
}

/**
 * Year built is only written when this file has one, so a re-import of a county
 * whose state file lacks it (Dallas) never erases a year loaded from elsewhere.
 */
function upsertFor(home: HomeRecord, importedAt: Date) {
  const { yearBuilt, ...rest } = home;
  const update =
    yearBuilt !== null
      ? { $set: { ...rest, yearBuilt, yearBuiltSource: "txgio", importedAt } }
      : { $set: { ...rest, importedAt }, $setOnInsert: { yearBuilt: null, yearBuiltSource: null } };
  return { updateOne: { filter: { fips: home.fips, propId: home.propId }, update, upsert: true } };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertLocalUnlessAllowed(options.uri, options.allowRemote);

  const shp = findFile(options.folder, ".shp");
  if (!shp) throw new Error(`No .shp file found under ${options.folder}`);
  const cpg = findFile(options.folder, ".cpg");
  const encoding = cpg && /utf-?8/i.test(fs.readFileSync(cpg, "utf8")) ? "utf-8" : "windows-1252";

  const thisYear = new Date().getFullYear();
  const importedAt = new Date();
  const statsByFips = new Map<string, RunStats>();
  const statsFor = (fips: string) => {
    if (!statsByFips.has(fips)) statsByFips.set(fips, emptyStats());
    return statsByFips.get(fips)!;
  };

  // Pass 1: read every record and merge repeats of the same property id.
  console.log(`[parcels] reading ${path.basename(shp)} (${encoding})${options.dryRun ? " DRY RUN" : ""}`);
  const source = await shapefile.open(shp, undefined, { encoding });
  const houses = new Map<string, HomePiece>();
  let parcelsRead = 0;
  let skippedOtherCounty = 0;
  for (;;) {
    const { done, value } = await source.read();
    if (done) break;
    parcelsRead++;

    const fipsDigits = String(value.properties.FIPS ?? "").replace(/\D/g, "");
    const stats = statsFor(fipsDigits.length === 3 ? `48${fipsDigits}` : fipsDigits);
    stats.parcelsRead++;
    if (!stats.taxYear) stats.taxYear = String(value.properties.TAX_YEAR ?? "").trim();

    const geometry =
      value.geometry && (value.geometry.type === "Polygon" || value.geometry.type === "MultiPolygon")
        ? (value.geometry as PolygonGeometry)
        : null;
    const home = parcelToHome(value.properties, geometry, thisYear);
    if (!home) continue;
    if (!isServiceCounty(home.fips)) {
      skippedOtherCounty++;
      continue;
    }

    const key = `${home.fips}|${home.propId}`;
    const piece: HomePiece = { home, area: geometry ? outlineArea(geometry) : 0 };
    const existing = houses.get(key);
    if (existing) {
      houses.set(key, mergeHomes(existing, piece));
      statsFor(home.fips).repeatedRecords++;
    } else {
      houses.set(key, piece);
    }
    if (parcelsRead % 50000 === 0) console.log(`[parcels] ${parcelsRead} records read`);
  }

  // Pass 2: count and write the merged houses.
  if (!options.dryRun) {
    await mongoose.connect(options.uri);
    await CanvassHomeModel.createIndexes();
    await CanvassCountyQualityModel.createIndexes();
  }

  let written = 0;
  let batch: ReturnType<typeof upsertFor>[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    if (!options.dryRun) await CanvassHomeModel.bulkWrite(batch, { ordered: false });
    written += batch.length;
    batch = [];
  };

  for (const { home } of houses.values()) {
    const stats = statsFor(home.fips);
    stats.homes++;
    if (home.yearBuilt !== null) {
      stats.withYearBuilt++;
      if (home.yearBuilt < 1990) stats.builtBefore1990++;
    }
    if (home.ownerLivesHere !== null) {
      stats.withOwnerSignal++;
      if (home.ownerLivesHere) stats.ownerLivesHere++;
    }
    batch.push(upsertFor(home, importedAt));
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  for (const [fips, stats] of statsByFips) {
    const county = SERVICE_COUNTIES.find((c) => c.fips === fips);
    if (!county) continue;
    const flags = countyFlags(stats);
    const row = {
      fips,
      county: county.name,
      area: county.area,
      source: options.source,
      taxYear: stats.taxYear,
      parcelsRead: stats.parcelsRead,
      homes: stats.homes,
      withYearBuilt: stats.withYearBuilt,
      builtBefore1990: stats.builtBefore1990,
      withOwnerSignal: stats.withOwnerSignal,
      ownerLivesHere: stats.ownerLivesHere,
      flags,
      suggestedStatus: suggestedStatus(flags),
      importedAt,
    };
    if (!options.dryRun) {
      await CanvassCountyQualityModel.updateOne({ fips, source: options.source }, { $set: row }, { upsert: true });
    }
    const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
    console.log(
      `[parcels] ${county.name} (${fips}): ${stats.parcelsRead} records, ${stats.repeatedRecords} repeats merged, ${stats.homes} homes, ` +
        `year built ${pct(stats.withYearBuilt, stats.homes)}, built before 1990 ${pct(stats.builtBefore1990, stats.withYearBuilt)}, ` +
        `owner lives here ${pct(stats.ownerLivesHere, stats.withOwnerSignal)} of ${pct(stats.withOwnerSignal, stats.homes)} known, ` +
        `flags [${flags.join(", ")}], suggested ${row.suggestedStatus}`
    );
  }

  console.log(
    `[parcels] done: ${parcelsRead} records read, ${written} homes ${options.dryRun ? "counted" : "written"}, ${skippedOtherCounty} outside our counties`
  );
  if (!options.dryRun) await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[parcels] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
