// scripts/canvass-import-wcad.ts
// Fills Williamson County houses from Williamson Central Appraisal District open
// data (downloaded by scripts/canvass-wcad-download.ts): year built from the Main
// Area building parts, and the homestead exemption. Then recounts Williamson's
// quality row.
//
//   npx vite-node scripts/canvass-import-wcad.ts --dir D:/knock-planner/data/wcad/2026
//
// Options:
//   --dir <folder>    the downloaded JSON-lines files
//   --source <name>   label added to the quality row, default "wcad-2026"
//   --uri <mongodb>   database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote    required to write to anything but the local test database
//   --dry-run         read and count only, write nothing
//
// A WCAD quickrefid is the state file's Prop_ID for Williamson (checked by
// address, 15 Sep 2026). Run AFTER scripts/canvass-import-parcels.ts has loaded
// Williamson: a --replace reload erases what this script adds.
// Prints counts only.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import mongoose from "mongoose";
import { appraisalUpdate, earliestYearBuilt } from "../src/lib/canvass/appraisal";
import { isActiveHomestead, isMainAreaSegment } from "../src/lib/canvass/wcad";
import { countyFlags, suggestedStatus } from "../src/lib/canvass/quality";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { CanvassHomeModel } from "../src/lib/models/CanvassHome";
import { CanvassCountyQualityModel } from "../src/lib/models/CanvassCountyQuality";

const WILLIAMSON_FIPS = "48491";
const BATCH_SIZE = 5000;

type Options = { dir: string; source: string; uri: string; allowRemote: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { dir: "", source: "wcad-2026", uri: "mongodb://127.0.0.1:27017/millerstorm", allowRemote: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dir") options.dir = argv[++i] ?? "";
    else if (arg === "--source") options.source = argv[++i] ?? options.source;
    else if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.dir) throw new Error("--dir is required");
  return options;
}

async function readJsonLines(file: string, onRow: (row: Record<string, string>) => void): Promise<number> {
  const reader = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  let rows = 0;
  for await (const line of reader) {
    if (!line.trim()) continue;
    onRow(JSON.parse(line));
    rows++;
  }
  return rows;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim());

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isLocalTestDatabase(options.uri) && !options.allowRemote) {
    throw new Error("Refusing to write to anything but the local test database. Pass --allow-remote only when approved.");
  }
  const thisYear = new Date().getFullYear();

  // Years per property from its Main Area parts (the download keeps only those).
  const years = new Map<string, string[]>();
  const segmentRows = await readJsonLines(path.join(options.dir, "segments-main-area.jsonl"), (row) => {
    const id = text(row.quickrefid);
    if (!id || !isMainAreaSegment(text(row.type))) return;
    const list = years.get(id) ?? [];
    list.push(text(row.actyrbuilt));
    years.set(id, list);
  });

  // WCAD's internal propertyid to the quickrefid the state file uses.
  const quickrefByProperty = new Map<string, string>();
  const propertyRows = await readJsonLines(path.join(options.dir, "properties.jsonl"), (row) => {
    const propertyId = text(row.propertyid);
    const quickref = text(row.quickrefid);
    if (propertyId && quickref) quickrefByProperty.set(propertyId, quickref);
  });

  const homesteads = new Set<string>();
  let homesteadRowsWithoutProperty = 0;
  const exemptionRows = await readJsonLines(path.join(options.dir, "homestead-exemptions.jsonl"), (row) => {
    if (!isActiveHomestead(text(row.exemptiontypedescription), text(row.exemptionstatuscode))) return;
    const quickref = quickrefByProperty.get(text(row.propertyid));
    if (quickref) homesteads.add(quickref);
    else homesteadRowsWithoutProperty++;
  });
  console.log(
    `[wcad] ${segmentRows} Main Area rows for ${years.size} properties; ${propertyRows} property rows; ` +
      `${exemptionRows} homestead rows, ${homesteads.size} properties with an active homestead (${homesteadRowsWithoutProperty} rows with no matching property)`
  );

  await mongoose.connect(options.uri);

  let williamsonHomes = 0;
  let matchedBuildings = 0;
  let yearsSet = 0;
  let homesteadsSet = 0;
  let batch: Array<{ updateOne: { filter: { _id: unknown }; update: { $set: object } } }> = [];
  const flush = async () => {
    if (batch.length === 0) return;
    if (!options.dryRun) await CanvassHomeModel.bulkWrite(batch, { ordered: false });
    batch = [];
  };

  const cursor = CanvassHomeModel.find({ fips: WILLIAMSON_FIPS }, { propId: 1 }).lean().cursor();
  for await (const home of cursor as AsyncIterable<{ _id: unknown; propId: string }>) {
    williamsonHomes++;
    const buildingYears = years.get(home.propId);
    if (buildingYears) matchedBuildings++;
    const update = appraisalUpdate(
      { yearBuilt: buildingYears ? earliestYearBuilt(buildingYears, thisYear) : null, homestead: homesteads.has(home.propId) },
      "wcad"
    );
    if (update.yearBuilt !== undefined) yearsSet++;
    if (update.ownerLivesHere) homesteadsSet++;
    if (Object.keys(update).length === 0) continue;
    batch.push({ updateOne: { filter: { _id: home._id }, update: { $set: update } } });
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
  console.log(
    `[wcad] Williamson homes ${williamsonHomes}: matched to a WCAD Main Area ${matchedBuildings} (${pct(matchedBuildings, williamsonHomes)}), ` +
      `year built ${options.dryRun ? "would be " : ""}set ${yearsSet} (${pct(yearsSet, williamsonHomes)}), homestead ${homesteadsSet} (${pct(homesteadsSet, williamsonHomes)})`
  );

  if (!options.dryRun) {
    const counts = {
      homes: williamsonHomes,
      withYearBuilt: await CanvassHomeModel.countDocuments({ fips: WILLIAMSON_FIPS, yearBuilt: { $ne: null } }),
      builtBefore1990: await CanvassHomeModel.countDocuments({ fips: WILLIAMSON_FIPS, yearBuilt: { $ne: null, $lt: 1990 } }),
      withOwnerSignal: await CanvassHomeModel.countDocuments({ fips: WILLIAMSON_FIPS, ownerLivesHere: { $ne: null } }),
      ownerLivesHere: await CanvassHomeModel.countDocuments({ fips: WILLIAMSON_FIPS, ownerLivesHere: true }),
    };
    const flags = countyFlags(counts);
    await CanvassCountyQualityModel.updateOne(
      { fips: WILLIAMSON_FIPS, source: "txgio-2025" },
      { $set: { ...counts, flags, suggestedStatus: suggestedStatus(flags) }, $addToSet: { extraSources: options.source } }
    );
    console.log(
      `[wcad] Williamson quality row now: year built ${pct(counts.withYearBuilt, counts.homes)}, built before 1990 ${pct(counts.builtBefore1990, counts.withYearBuilt)}, ` +
        `owner lives here ${pct(counts.ownerLivesHere, counts.withOwnerSignal)} of ${pct(counts.withOwnerSignal, counts.homes)} known, ` +
        `flags [${flags.join(", ")}], suggested ${suggestedStatus(flags)}`
    );
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[wcad] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
