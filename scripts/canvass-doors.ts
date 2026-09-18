// scripts/canvass-doors.ts
// Loads every RepCard door (RepCard "customers") into the Canvass Map with its
// position, current status and knock history (plan T4.1). Read-only toward RepCard:
// GET requests only, one page at a time with a pause between pages.
//
//   npx vite-node scripts/canvass-doors.ts --env "D:/vs code/Miller-Storm-main/.env"
//
// Options:
//   --env <file>       .env file holding REPCARD_API_KEY, default ./.env
//   --from-page <n>    first page to read, default 1 (to resume a stopped run)
//   --max-pages <n>    stop after n pages of 100 doors (smoke tests), default all
//   --delay-ms <n>     pause between pages, default 500 (about 2 requests a second)
//   --uri <mongodb>    database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote     required to write to anything but the local test database
//   --dry-run          read and count only, write nothing
//
// Only REPCARD_API_KEY is read from the env file. Never stores or prints the
// homeowner's name, email, phone or notes; prints counts only.

import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { createClient } from "../src/lib/repcard/client";
import { doorEvents, mapDoor, type DoorRecord } from "../src/lib/canvass/doors";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { CanvassDoorModel } from "../src/lib/models/CanvassDoor";

type Options = { env: string; fromPage: number; maxPages: number; delayMs: number; uri: string; allowRemote: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = {
    env: path.resolve(".env"),
    fromPage: 1,
    maxPages: Infinity,
    delayMs: 500,
    uri: "mongodb://127.0.0.1:27017/millerstorm",
    allowRemote: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--env") options.env = argv[++i] ?? "";
    else if (arg === "--from-page") options.fromPage = Number(argv[++i]);
    else if (arg === "--max-pages") options.maxPages = Number(argv[++i]);
    else if (arg === "--delay-ms") options.delayMs = Number(argv[++i]);
    else if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.fromPage) || options.fromPage < 1) throw new Error("--from-page must be 1 or more");
  if (!(options.maxPages > 0)) throw new Error("--max-pages must be a positive number");
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) throw new Error("--delay-ms must be 0 or more");
  return options;
}

/** Only the wanted KEY=VALUE lines of an env file. Nothing else is loaded, and values are never printed. */
function readEnvKeys(file: string, wanted: (name: string) => boolean): Record<string, string> {
  if (!fs.existsSync(file)) throw new Error(`No env file at ${file}`);
  const keys: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && wanted(match[1])) keys[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return keys;
}

function upsertFor(door: DoorRecord, loadedAt: Date) {
  const { location, ...fields } = door;
  const update: Record<string, unknown> = { $set: { ...fields, ...(location ? { location } : {}), loadedAt } };
  if (!location) update.$unset = { location: "" };
  return { updateOne: { filter: { doorId: door.doorId }, update, upsert: true } };
}

const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
const listOf = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([key, n]) => `${key} ${n}`).join(", ");
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isLocalTestDatabase(options.uri) && !options.allowRemote) {
    throw new Error("Refusing to write to anything but the local test database. Pass --allow-remote only when approved.");
  }
  const apiKey = readEnvKeys(options.env, (name) => name === "REPCARD_API_KEY").REPCARD_API_KEY;
  if (!apiKey) throw new Error("REPCARD_API_KEY not found in the env file");
  const client = createClient(apiKey);

  await mongoose.connect(options.uri);
  const loadedAt = new Date();
  const statuses = new Map<string, number>();
  const statusSources = new Map<string, number>();
  let pages = 0;
  let doors = 0;
  let noId = 0;
  let withPosition = 0;
  let knocks = 0;
  let verified = 0;
  let noEvents = 0;
  let totalPages = Infinity;
  let totalCount = 0;

  for (let page = options.fromPage; page <= totalPages && pages < options.maxPages; page++) {
    let result;
    try {
      result = await client.fetchCustomersPage(page);
    } catch (error) {
      throw new Error(`page ${page}: ${error instanceof Error ? error.message : error} (resume with --from-page ${page})`);
    }
    pages++;
    if (result.totalPages > 0) totalPages = result.totalPages;
    if (result.totalCount > 0) totalCount = result.totalCount;
    if (result.data.length === 0) break;

    const writes = [];
    for (const customer of result.data) {
      const door = mapDoor(customer);
      if (!door.doorId) {
        noId++;
        continue;
      }
      doors++;
      if (door.location) withPosition++;
      knocks += door.knocks.length;
      verified += door.knocks.filter((k) => k.verified).length;
      if (doorEvents(door).length === 0) noEvents++;
      bump(statuses, door.status || "(none)");
      bump(statusSources, door.statusAtSource ?? "(none)");
      writes.push(upsertFor(door, loadedAt));
    }
    if (!options.dryRun && writes.length > 0) await CanvassDoorModel.bulkWrite(writes as never, { ordered: false });
    if (pages % 50 === 0) console.log(`[doors] page ${page} of ${totalPages}: ${doors} doors so far`);
    if (options.delayMs > 0) await sleep(options.delayMs);
  }

  console.log(
    `[doors] ${pages} pages read (RepCard lists ${totalCount} doors on ${totalPages} pages): ${doors} doors ${options.dryRun ? "counted" : "written"}, ` +
      `no id ${noId}, with a position ${withPosition} (${pct(withPosition, doors)}), ${knocks} knocks (${verified} verified), ${noEvents} doors with no dated event`
  );
  console.log(`[doors] current status: ${listOf(statuses)}`);
  console.log(`[doors] status date taken from: ${listOf(statusSources)}`);

  const fullRun = options.fromPage === 1 && options.maxPages === Infinity && !options.dryRun;
  if (fullRun) {
    const stale = await CanvassDoorModel.countDocuments({ loadedAt: { $lt: loadedAt } });
    console.log(`[doors] ${stale} stored doors were not in this RepCard read (kept for now)`);
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[doors] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
