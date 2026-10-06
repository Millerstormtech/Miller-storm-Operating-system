// scripts/canvass-parker-owner.ts
// Refreshes Parker County's owner-lives-here reading from Parker CAD's own map
// service (rules in src/lib/canvass/parkerCad.ts). Part of the daily refresh,
// before the colours; also runs on its own.
//
//   npx vite-node scripts/canvass-parker-owner.ts
//
// Options:
//   --uri <mongodb>   database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote    required to write to anything but the local test database
//   --dry-run         read and count only, write nothing
//
// When the service cannot be read, or answers with fewer than MIN_PARKER_PARCELS
// parcels, nothing is written: the script prints a SKIPPED line and exits with
// PARTIAL_EXIT_CODE, so the daily refresh carries on with yesterday's reading
// and emails a warning. Houses with no parcel in the answer keep their reading.
// Prints counts only; owner names are never requested.

import mongoose from "mongoose";
import { PARTIAL_EXIT_CODE } from "../src/lib/canvass/dailyRun";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { MIN_PARKER_PARCELS, PARKER_FIELDS, PARKER_FIPS, PARKER_SERVICE, parkerReadings, type ParkerParcel } from "../src/lib/canvass/parkerCad";
import { CanvassHomeModel } from "../src/lib/models/CanvassHome";

type Options = { uri: string; allowRemote: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { uri: "mongodb://127.0.0.1:27017/millerstorm", allowRemote: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

const PAGE = 2000; // the service's own maxRecordCount

/** Every parcel with a property id, 2,000 at a time, three tries per page. */
async function fetchParcels(): Promise<ParkerParcel[]> {
  const parcels: ParkerParcel[] = [];
  for (let offset = 0; ; ) {
    const url =
      `${PARKER_SERVICE}?where=prop_id+IS+NOT+NULL&outFields=${PARKER_FIELDS.join(",")}` +
      `&returnGeometry=false&orderByFields=ObjectID_1&resultOffset=${offset}&resultRecordCount=${PAGE}&f=json`;
    let page: { features?: Array<{ attributes: ParkerParcel }>; exceededTransferLimit?: boolean; error?: { message?: string } } | null = null;
    let lastError = "";
    for (let attempt = 0; attempt < 3 && !page; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        page = await response.json();
        if (page?.error) throw new Error(page.error.message ?? "service error");
      } catch (error) {
        page = null;
        lastError = error instanceof Error ? error.message : String(error);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    if (!page) throw new Error(`the Parker CAD map service did not answer at row ${offset}: ${lastError}`);
    const features = page.features ?? [];
    for (const feature of features) parcels.push(feature.attributes);
    offset += features.length;
    if (features.length === 0 || (!page.exceededTransferLimit && features.length < PAGE)) break;
  }
  return parcels;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.dryRun && !options.allowRemote && !isLocalTestDatabase(options.uri)) {
    throw new Error("Refusing to write to a database that is not the local test database. Pass --allow-remote on purpose.");
  }

  let parcels: ParkerParcel[];
  try {
    parcels = await fetchParcels();
  } catch (error) {
    console.log(`[parker] SKIPPED Parker owner refresh: ${error instanceof Error ? error.message : error}`);
    process.exitCode = PARTIAL_EXIT_CODE;
    return;
  }
  if (parcels.length < MIN_PARKER_PARCELS) {
    console.log(`[parker] SKIPPED Parker owner refresh: the service returned only ${parcels.length} parcels (expected at least ${MIN_PARKER_PARCELS})`);
    process.exitCode = PARTIAL_EXIT_CODE;
    return;
  }
  const readings = parkerReadings(parcels);

  await mongoose.connect(options.uri);
  const homes = (await CanvassHomeModel.find({ fips: PARKER_FIPS }, { propId: 1, ownerLivesHere: 1 }).lean()) as Array<{ _id: unknown; propId: string; ownerLivesHere?: boolean | null }>;
  const counts = { houses: homes.length, noParcel: 0, unchanged: 0, changed: 0, livesHere: 0, elsewhere: 0, unknown: 0 };
  const writes: mongoose.AnyBulkWriteOperation[] = [];
  for (const home of homes) {
    const reading = readings.get(String(home.propId));
    if (reading === undefined) {
      counts.noParcel++;
      continue;
    }
    if (reading === true) counts.livesHere++;
    else if (reading === false) counts.elsewhere++;
    else counts.unknown++;
    if ((home.ownerLivesHere ?? null) === reading) {
      counts.unchanged++;
      continue;
    }
    counts.changed++;
    writes.push({ updateOne: { filter: { _id: home._id }, update: { $set: { ownerLivesHere: reading } } } });
  }
  if (!options.dryRun) {
    for (let i = 0; i < writes.length; i += 2000) await CanvassHomeModel.bulkWrite(writes.slice(i, i + 2000), { ordered: false });
  }
  console.log(
    `[parker] ${options.dryRun ? "DRY RUN: " : ""}${parcels.length} parcels read; ${counts.houses} Parker houses: ${counts.changed} changed, ` +
      `${counts.unchanged} unchanged, ${counts.noParcel} with no parcel (kept); now lives here ${counts.livesHere}, elsewhere ${counts.elsewhere}, unknown ${counts.unknown}`
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[parker] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
