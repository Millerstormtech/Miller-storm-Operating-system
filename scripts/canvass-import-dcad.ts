// scripts/canvass-import-dcad.ts
// Fills in Dallas County houses from Dallas Central Appraisal District's free
// data files: year built and roof material (RES_DETAIL.CSV) and the homestead
// exemption (APPLIED_STD_EXEMPT.CSV). Then recounts Dallas's data-quality row.
//
//   npx vite-node scripts/canvass-import-dcad.ts --dir D:/knock-planner/data/dcad/2026-current
//
// Options:
//   --dir <folder>    the unzipped DCAD<year>_CURRENT files
//   --source <name>   label added to the quality row, default "dcad-2026"
//   --uri <mongodb>   database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote    required to write to anything but the local test database
//   --dry-run         read and count only, write nothing
//
// Run AFTER scripts/canvass-import-parcels.ts has loaded Dallas County: a
// --replace reload of Dallas erases what this script adds.
// Prints counts only, never names or addresses.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import mongoose from "mongoose";
import { parseCsvLine } from "../src/lib/canvass/csv";
import { earliestYearBuilt, hasHomestead, dallasUpdate } from "../src/lib/canvass/dcad";
import { countyFlags, suggestedStatus } from "../src/lib/canvass/quality";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { CanvassHomeModel } from "../src/lib/models/CanvassHome";
import { CanvassCountyQualityModel } from "../src/lib/models/CanvassCountyQuality";

const DALLAS_FIPS = "48113";
const BATCH_SIZE = 5000;

type Options = { dir: string; source: string; uri: string; allowRemote: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { dir: "", source: "dcad-2026", uri: "mongodb://127.0.0.1:27017/millerstorm", allowRemote: false, dryRun: false };
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

/** Streams a CSV file, calling onRow with a column lookup for every data line. */
async function readCsv(file: string, onRow: (get: (column: string) => string) => void): Promise<number> {
  const reader = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  let header: Map<string, number> | null = null;
  let rows = 0;
  for await (const line of reader) {
    const fields = parseCsvLine(line);
    if (!header) {
      header = new Map(fields.map((name, index) => [name.trim().toUpperCase(), index]));
      continue;
    }
    const columns = header;
    rows++;
    onRow((column) => fields[columns.get(column) ?? -1] ?? "");
  }
  return rows;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isLocalTestDatabase(options.uri) && !options.allowRemote) {
    throw new Error("Refusing to write to anything but the local test database. Pass --allow-remote only when approved.");
  }
  const thisYear = new Date().getFullYear();

  // Buildings: every year built per account, and the first roof material given.
  const buildings = new Map<string, { years: string[]; roof: string }>();
  const buildingRows = await readCsv(path.join(options.dir, "RES_DETAIL.CSV"), (get) => {
    const account = get("ACCOUNT_NUM").trim();
    if (!account) return;
    const entry = buildings.get(account) ?? { years: [], roof: "" };
    entry.years.push(get("YR_BUILT"));
    if (!entry.roof) entry.roof = get("ROOF_MAT_DESC").trim();
    buildings.set(account, entry);
  });

  // Homestead exemptions.
  const homesteads = new Set<string>();
  const exemptionRows = await readCsv(path.join(options.dir, "APPLIED_STD_EXEMPT.CSV"), (get) => {
    if (hasHomestead(get("HS_PCT"))) homesteads.add(get("ACCOUNT_NUM").trim());
  });
  console.log(`[dcad] ${buildingRows} building rows for ${buildings.size} accounts; ${exemptionRows} exemption rows, ${homesteads.size} accounts with a homestead`);

  await mongoose.connect(options.uri);

  let dallasHomes = 0;
  let matchedBuildings = 0;
  let yearsSet = 0;
  let homesteadsSet = 0;
  let roofsSet = 0;
  let batch: Array<{ updateOne: { filter: { _id: unknown }; update: { $set: object } } }> = [];
  const flush = async () => {
    if (batch.length === 0) return;
    if (!options.dryRun) await CanvassHomeModel.bulkWrite(batch, { ordered: false });
    batch = [];
  };

  const cursor = CanvassHomeModel.find({ fips: DALLAS_FIPS }, { propId: 1 }).lean().cursor();
  for await (const home of cursor as AsyncIterable<{ _id: unknown; propId: string }>) {
    dallasHomes++;
    const building = buildings.get(home.propId);
    if (building) matchedBuildings++;
    const update = dallasUpdate({
      yearBuilt: building ? earliestYearBuilt(building.years, thisYear) : null,
      roofMaterial: building?.roof ?? "",
      homestead: homesteads.has(home.propId),
    });
    if (update.yearBuilt !== undefined) yearsSet++;
    if (update.ownerLivesHere) homesteadsSet++;
    if (update.roofMaterial) roofsSet++;
    if (Object.keys(update).length === 0) continue;
    batch.push({ updateOne: { filter: { _id: home._id }, update: { $set: update } } });
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
  console.log(
    `[dcad] Dallas homes ${dallasHomes}: matched to a DCAD building ${matchedBuildings} (${pct(matchedBuildings, dallasHomes)}), ` +
      `year built ${options.dryRun ? "would be " : ""}set ${yearsSet} (${pct(yearsSet, dallasHomes)}), ` +
      `homestead ${homesteadsSet} (${pct(homesteadsSet, dallasHomes)}), roof material ${roofsSet}`
  );

  if (!options.dryRun) {
    const counts = {
      homes: dallasHomes,
      withYearBuilt: await CanvassHomeModel.countDocuments({ fips: DALLAS_FIPS, yearBuilt: { $ne: null } }),
      builtBefore1990: await CanvassHomeModel.countDocuments({ fips: DALLAS_FIPS, yearBuilt: { $ne: null, $lt: 1990 } }),
      withOwnerSignal: await CanvassHomeModel.countDocuments({ fips: DALLAS_FIPS, ownerLivesHere: { $ne: null } }),
      ownerLivesHere: await CanvassHomeModel.countDocuments({ fips: DALLAS_FIPS, ownerLivesHere: true }),
    };
    // Keep the base import's record and id counts, so a recount never drops an id flag.
    const base = (await CanvassCountyQualityModel.findOne({ fips: DALLAS_FIPS, source: "txgio-2025" }, { parcelsRead: 1, idConflicts: 1 }).lean()) as {
      parcelsRead?: number;
      idConflicts?: number;
    } | null;
    const flags = countyFlags({ ...counts, records: base?.parcelsRead, idConflicts: base?.idConflicts });
    await CanvassCountyQualityModel.updateOne(
      { fips: DALLAS_FIPS, source: "txgio-2025" },
      { $set: { ...counts, flags, suggestedStatus: suggestedStatus(flags) }, $addToSet: { extraSources: options.source } }
    );
    console.log(
      `[dcad] Dallas quality row now: year built ${pct(counts.withYearBuilt, counts.homes)}, built before 1990 ${pct(counts.builtBefore1990, counts.withYearBuilt)}, ` +
        `owner lives here ${pct(counts.ownerLivesHere, counts.withOwnerSignal)} of ${pct(counts.withOwnerSignal, counts.homes)} known, ` +
        `flags [${flags.join(", ")}], suggested ${suggestedStatus(flags)}`
    );
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[dcad] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
