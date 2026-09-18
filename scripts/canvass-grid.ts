// scripts/canvass-grid.ts
// Builds the pre-count behind the zoomed-out Canvass Map: one row per 0.01-degree
// square with how many graded houses of each colour sit in it (rules in
// src/lib/canvass/grid.ts). Run after scripts/canvass-grade.ts; the nightly job
// runs the two together.
//
//   npx vite-node scripts/canvass-grid.ts
//
// Options:
//   --uri <mongodb>   database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote    required to write to anything but the local test database
//   --dry-run         count only, write nothing
//
// Squares are upserted in place and the ones from the previous run that no
// longer exist are removed afterwards, so the map never sees an empty grid
// (and if it ever did, the API falls back to counting houses live).
// Prints counts only.

import mongoose from "mongoose";
import { gridPipeline } from "../src/lib/canvass/grid";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { CanvassHomeModel } from "../src/lib/models/CanvassHome";
import { CanvassGridCellModel } from "../src/lib/models/CanvassGridCell";

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

const BATCH = 5000;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.dryRun && !options.allowRemote && !isLocalTestDatabase(options.uri)) {
    throw new Error("Refusing to write to a database that is not the local test database. Pass --allow-remote on purpose.");
  }
  await mongoose.connect(options.uri);
  if (!options.dryRun) await CanvassGridCellModel.createIndexes();

  const builtAt = new Date();
  const started = Date.now();
  type Row = { _id: { col: number; row: number }; count: number; green: number; yellow: number; orange: number; red: number };
  // grid.ts stays free of Mongoose types, so the plain stages are typed here, at the one call.
  const cursor = CanvassHomeModel.aggregate(gridPipeline() as unknown as mongoose.PipelineStage[]).allowDiskUse(true).cursor();

  let squares = 0;
  let houses = 0;
  let batch: mongoose.AnyBulkWriteOperation[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    if (!options.dryRun) await CanvassGridCellModel.bulkWrite(batch, { ordered: false });
    batch = [];
  };
  for await (const row of cursor as AsyncIterable<Row>) {
    squares++;
    houses += row.count;
    batch.push({
      updateOne: {
        filter: { col: row._id.col, row: row._id.row },
        update: { $set: { count: row.count, green: row.green, yellow: row.yellow, orange: row.orange, red: row.red, builtAt } },
        upsert: true,
      },
    });
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  let removed = 0;
  if (!options.dryRun) {
    const result = await CanvassGridCellModel.deleteMany({ builtAt: { $lt: builtAt } });
    removed = result.deletedCount ?? 0;
  }

  console.log(
    `[grid] ${options.dryRun ? "DRY RUN: " : ""}${squares} squares holding ${houses} graded houses in ${((Date.now() - started) / 1000).toFixed(1)} s; ` +
      `${removed} squares from the previous run removed`
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[grid] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
