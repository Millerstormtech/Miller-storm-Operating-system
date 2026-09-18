// scripts/canvass-jobs-backfill.ts
// Loads every AccuLynx job's position and stage into the Canvass Map, for every
// AccuLynx location (plan T4.2). Read-only toward AccuLynx: GET requests only,
// paced per location key by the existing client.
//
//   npx vite-node scripts/canvass-jobs-backfill.ts --env "D:/vs code/Miller-Storm-main/.env"
//
// Options:
//   --env <file>       .env file holding the ACCULYNX_API_KEY_<LOCATION> keys, default ./.env
//   --max-pages <n>    stop each location after n pages of 25 jobs (smoke tests), default all
//   --uri <mongodb>    database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote     required to write to anything but the local test database
//   --dry-run          read and count only, write nothing
//
// Only the AccuLynx keys are read from the env file. Prints counts only: never job
// names, addresses or keys.

import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { createClient } from "../src/lib/acculynx/client";
import { cleanBranchName, getLocationKeys } from "../src/lib/acculynx/config";
import { isOpenJob, mapJob, type JobRecord } from "../src/lib/canvass/jobs";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { CanvassJobModel } from "../src/lib/models/CanvassJob";

const PAGE_SIZE = 25; // AccuLynx's maximum for /jobs

type Options = { env: string; maxPages: number; uri: string; allowRemote: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { env: path.resolve(".env"), maxPages: Infinity, uri: "mongodb://127.0.0.1:27017/millerstorm", allowRemote: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--env") options.env = argv[++i] ?? "";
    else if (arg === "--max-pages") options.maxPages = Number(argv[++i]);
    else if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!(options.maxPages > 0)) throw new Error("--max-pages must be a positive number");
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

function upsertFor(job: JobRecord, loadedAt: Date) {
  const { location, ...fields } = job;
  const update: Record<string, unknown> = { $set: { ...fields, ...(location ? { location } : {}), loadedAt } };
  if (!location) update.$unset = { location: "" };
  return { updateOne: { filter: { jobId: job.jobId }, update, upsert: true } };
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isLocalTestDatabase(options.uri) && !options.allowRemote) {
    throw new Error("Refusing to write to anything but the local test database. Pass --allow-remote only when approved.");
  }
  const locations = getLocationKeys(readEnvKeys(options.env, (name) => name === "ACCULYNX_API_KEY" || name.startsWith("ACCULYNX_API_KEY_")));
  if (locations.length === 0) throw new Error("No AccuLynx keys found in the env file");

  await mongoose.connect(options.uri);
  const loadedAt = new Date();
  let totalJobs = 0;

  for (const { envVar, key } of locations) {
    const client = createClient(key);
    const company = await client.fetchCompanySettings();
    const branch = company ? cleanBranchName(company.name) : envVar.replace(/^ACCULYNX_API_KEY_?/, "") || "Unknown";

    const seen = new Set<string>();
    const stages = new Map<string, number>();
    let listed = 0;
    let pages = 0;
    let withPosition = 0;
    let open = 0;
    let noId = 0;

    for (let start = 0; pages < options.maxPages; start += PAGE_SIZE) {
      const page = await client.fetchAllJobsPage(start);
      pages++;
      if (page.count) listed = page.count;
      const writes = [];
      for (const item of page.items) {
        const job = mapJob(item, branch);
        if (!job.jobId) {
          noId++;
          continue;
        }
        if (seen.has(job.jobId)) continue;
        seen.add(job.jobId);
        if (job.location) withPosition++;
        if (isOpenJob(job)) open++;
        const stage = job.milestone || "(none)";
        stages.set(stage, (stages.get(stage) ?? 0) + 1);
        writes.push(upsertFor(job, loadedAt));
      }
      if (!options.dryRun && writes.length > 0) await CanvassJobModel.bulkWrite(writes as never, { ordered: false });
      if (page.items.length < PAGE_SIZE) break;
    }

    totalJobs += seen.size;
    const stageList = [...stages.entries()].sort((a, b) => b[1] - a[1]).map(([stage, n]) => `${stage} ${n}`).join(", ");
    console.log(
      `[jobs] ${branch}: AccuLynx lists ${listed}, read ${seen.size} in ${pages} pages, with a position ${withPosition} (${pct(withPosition, seen.size)}), ` +
        `not cancelled ${open}, no id ${noId}; stages: ${stageList}`
    );
    if (options.maxPages === Infinity && seen.size < listed) {
      console.log(`[jobs] ${branch}: WARNING read ${listed - seen.size} fewer jobs than AccuLynx lists (jobs may have moved between pages during the read)`);
    }
  }

  console.log(`[jobs] done: ${totalJobs} jobs ${options.dryRun ? "counted" : "written"} across ${locations.length} AccuLynx locations`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[jobs] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
