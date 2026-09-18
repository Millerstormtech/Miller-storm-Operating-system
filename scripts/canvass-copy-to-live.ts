// scripts/canvass-copy-to-live.ts
// Copies the Canvass Map's collections from the local test database to another
// database (go-live step 2, plan Milestone 7): the houses, hail squares, doors,
// jobs, pre-count squares and county quality rows, then the indexes the app's
// models declare, then a count-by-count check.
//
//   npx vite-node scripts/canvass-copy-to-live.ts --to "mongodb://<user>:<pass>@127.0.0.1:27018/millerstorm?authSource=admin" --allow-remote
//
// Options:
//   --from <mongodb>   the source, default the local test database
//   --to <mongodb>     the target (required). Anything but the local test database needs --allow-remote.
//   --allow-remote     say so on purpose when the target is the live database (through the SSH tunnel)
//   --replace          drop the target's canvass_* collections first; without it the copy refuses a
//                      target that already holds any canvass rows
//   --resume           carry on after a dropped connection: each collection continues above the
//                      highest _id already on the target (rows are copied in _id order), so nothing
//                      is copied twice and nothing is dropped. The count check at the end still
//                      decides; a mismatch means a --replace reload.
//   --limit <n>        copy at most n rows per collection (a rehearsal)
//   --dry-run          count only, write nothing
//
// Only the six canvass_* collections are ever touched on the target; nothing else
// in that database is read or written. Prints counts only.

import mongoose from "mongoose";
import { MongoClient, type Document } from "mongodb";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { CanvassHomeModel } from "../src/lib/models/CanvassHome";
import { CanvassHailCellModel } from "../src/lib/models/CanvassHailCell";
import { CanvassDoorModel } from "../src/lib/models/CanvassDoor";
import { CanvassJobModel } from "../src/lib/models/CanvassJob";
import { CanvassGridCellModel } from "../src/lib/models/CanvassGridCell";
import { CanvassCountyQualityModel } from "../src/lib/models/CanvassCountyQuality";

const COLLECTIONS = ["canvass_county_quality", "canvass_homes", "canvass_hail_cells", "canvass_doors", "canvass_jobs", "canvass_grid_cells"];
const MODELS = [CanvassCountyQualityModel, CanvassHomeModel, CanvassHailCellModel, CanvassDoorModel, CanvassJobModel, CanvassGridCellModel];
const BATCH = 2000;

type Options = { from: string; to: string; allowRemote: boolean; replace: boolean; resume: boolean; limit: number | null; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { from: "mongodb://127.0.0.1:27017/millerstorm", to: "", allowRemote: false, replace: false, resume: false, limit: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") options.from = argv[++i] ?? options.from;
    else if (arg === "--to") options.to = argv[++i] ?? "";
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--replace") options.replace = true;
    else if (arg === "--resume") options.resume = true;
    else if (arg === "--limit") options.limit = Number(argv[++i]);
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.to) throw new Error("--to is required");
  if (options.replace && options.resume) throw new Error("--replace and --resume do not go together");
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit <= 0)) throw new Error("--limit must be a whole number above 0");
  return options;
}

/** The database name in a connection string, so the report can say where the rows went without printing the string. */
function databaseOf(uri: string): string {
  const match = /\/([^/?]+)(\?|$)/.exec(uri.replace(/^mongodb(\+srv)?:\/\/[^/]+/, ""));
  return match?.[1] ?? "(default)";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.dryRun && !options.allowRemote && !isLocalTestDatabase(options.to)) {
    throw new Error("The target is not the local test database. Pass --allow-remote on purpose.");
  }
  const source = new MongoClient(options.from);
  const target = new MongoClient(options.to);
  await source.connect();
  await target.connect();
  const from = source.db();
  const to = target.db();
  console.log(`[copy] from database "${from.databaseName}" to database "${to.databaseName}" (${databaseOf(options.to)})${options.dryRun ? " DRY RUN" : ""}${options.limit ? ` limit ${options.limit} per collection` : ""}`);

  // Refuse to pile onto rows that are already there unless told to replace them, or to resume.
  const existing = await Promise.all(COLLECTIONS.map(async (name) => ({ name, count: await to.collection(name).estimatedDocumentCount() })));
  const present = existing.filter((c) => c.count > 0);
  if (present.length > 0 && !options.replace && !options.resume) {
    throw new Error(`The target already holds ${present.map((c) => `${c.name} (${c.count})`).join(", ")}. Pass --replace to drop and reload them, or --resume to carry on.`);
  }
  if (present.length > 0 && options.replace && !options.dryRun) {
    for (const c of present) {
      await to.collection(c.name).drop();
      console.log(`[copy] dropped ${c.name} (${c.count} rows) on the target`);
    }
  }

  const started = Date.now();
  const expected = new Map<string, number>();
  for (const name of COLLECTIONS) {
    const total = await from.collection(name).countDocuments();
    // Resuming: carry on above the highest _id the target already holds.
    let after: unknown = null;
    let already = 0;
    if (options.resume) {
      const last = await to.collection(name).find({}, { projection: { _id: 1 } }).sort({ _id: -1 }).limit(1).next();
      after = last ? last._id : null;
      already = after ? await to.collection(name).countDocuments() : 0;
      if (after) console.log(`[copy] ${name}: target already holds ${already} rows, resuming above the highest _id`);
    }
    const filter = after ? { _id: { $gt: after } } : {};
    const remaining = after ? await from.collection(name).countDocuments(filter as Document) : total;
    const want = options.limit ? Math.min(options.limit, remaining) : remaining;
    expected.set(name, options.limit ? already + want : total);
    let copied = 0;
    if (!options.dryRun) {
      const cursor = from.collection(name).find(filter as Document, { sort: { _id: 1 }, limit: options.limit ?? undefined });
      let batch: Document[] = [];
      for await (const doc of cursor) {
        batch.push(doc);
        if (batch.length >= BATCH) {
          await to.collection(name).insertMany(batch, { ordered: false });
          copied += batch.length;
          batch = [];
          if (copied % 200000 === 0) console.log(`[copy]   ${name}: ${copied} of ${want}`);
        }
      }
      if (batch.length > 0) {
        await to.collection(name).insertMany(batch, { ordered: false });
        copied += batch.length;
      }
    }
    console.log(`[copy] ${name}: ${options.dryRun ? `${want} rows would be copied` : `${copied} of ${want} rows copied`} (source holds ${total})`);
  }

  if (!options.dryRun) {
    // The indexes the app declares (2dsphere, the unique keys), built on the target.
    await mongoose.connect(options.to);
    for (const model of MODELS) await model.createIndexes();
    await mongoose.disconnect();
    console.log("[copy] indexes built on the target");

    let mismatch = 0;
    for (const name of COLLECTIONS) {
      const a = expected.get(name) ?? 0;
      const b = await to.collection(name).countDocuments();
      if (a !== b) mismatch++;
      console.log(`[copy] check ${name}: expected ${a}, target has ${b}${a === b ? "" : "  <-- MISMATCH"}`);
    }
    console.log(`[copy] done in ${((Date.now() - started) / 60000).toFixed(1)} min; ${mismatch === 0 ? "every count matches" : `${mismatch} collection(s) DO NOT match`}`);
    if (mismatch > 0) process.exitCode = 2;
  }
  await source.close();
  await target.close();
}

main().catch(async (error) => {
  console.error("[copy] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
