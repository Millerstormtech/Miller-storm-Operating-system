// scripts/canvass-hail-load.ts
// Loads decoded hail radar squares (JSON lines from scripts/canvass-hail/decode.py)
// into the Canvass Map database.
//
//   npx vite-node scripts/canvass-hail-load.ts --path D:/knock-planner/data/hail/mesh
//
// Options:
//   --path <file or folder>   one .jsonl file, or every .jsonl file in a folder
//   --uri <mongodb>           database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote            required to write to anything but the local test database
//   --dry-run                 read and count only, write nothing
//
// Safety: refuses anything but the local test database unless --allow-remote is
// given (src/lib/canvass/dbGuard.ts), and never reads MONGODB_URI. Reloading a
// day updates its squares instead of duplicating them.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import mongoose from "mongoose";
import { parseHailLine } from "../src/lib/canvass/hailCells";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { CanvassHailCellModel } from "../src/lib/models/CanvassHailCell";

const BATCH_SIZE = 5000;

type Options = { path: string; uri: string; allowRemote: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { path: "", uri: "mongodb://127.0.0.1:27017/millerstorm", allowRemote: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--path") options.path = argv[++i] ?? "";
    else if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.path) throw new Error("--path is required");
  return options;
}

function listFiles(target: string): string[] {
  if (fs.statSync(target).isDirectory()) {
    return fs
      .readdirSync(target)
      .filter((name) => name.endsWith(".jsonl"))
      .sort()
      .map((name) => path.join(target, name));
  }
  return [target];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isLocalTestDatabase(options.uri) && !options.allowRemote) {
    throw new Error("Refusing to write to anything but the local test database. Pass --allow-remote only when approved.");
  }

  const files = listFiles(options.path);
  if (!options.dryRun) {
    await mongoose.connect(options.uri);
    await CanvassHailCellModel.createIndexes();
  }

  const loadedAt = new Date();
  let totalKept = 0;
  let totalRejected = 0;

  for (const file of files) {
    let lines = 0;
    let kept = 0;
    let rejected = 0;
    let biggest = 0;
    let batch: Array<{ updateOne: { filter: { cellKey: string }; update: object; upsert: boolean } }> = [];

    const flush = async () => {
      if (batch.length === 0) return;
      if (!options.dryRun) await CanvassHailCellModel.bulkWrite(batch, { ordered: false });
      batch = [];
    };

    const reader = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
    for await (const line of reader) {
      if (!line.trim()) continue;
      lines++;
      const cell = parseHailLine(line);
      if (!cell) {
        rejected++;
        continue;
      }
      kept++;
      biggest = Math.max(biggest, cell.inches);
      batch.push({ updateOne: { filter: { cellKey: cell.cellKey }, update: { $set: { ...cell, loadedAt } }, upsert: true } });
      if (batch.length >= BATCH_SIZE) await flush();
    }
    await flush();

    totalKept += kept;
    totalRejected += rejected;
    if (lines > 0) {
      console.log(`[hail] ${path.basename(file)}: ${lines} lines, ${kept} squares ${options.dryRun ? "counted" : "loaded"}, ${rejected} rejected, biggest ${biggest} in`);
    }
  }

  console.log(`[hail] done: ${files.length} files, ${totalKept} squares ${options.dryRun ? "counted" : "loaded"}, ${totalRejected} rejected`);
  if (!options.dryRun) await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[hail] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
