// scripts/canvass-jobs-signed.ts
// Reads when recent AccuLynx jobs were signed (reached Approved) from each job's
// milestone history, for the Canvass Map's neighbour-signed bonus and the backtest.
// Read-only toward AccuLynx: one paced GET per job, per location key.
//
//   npx vite-node scripts/canvass-jobs-signed.ts --env "D:/vs code/Miller-Storm-main/.env" --max-jobs 20
//
// Options:
//   --env <file>          .env file holding the ACCULYNX_API_KEY_<LOCATION> keys, default ./.env
//   --since-months <n>    only jobs changed in the last n months, default 15
//   --max-jobs <n>        stop after n jobs in all (smoke tests), default no limit
//   --uri <mongodb>       database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote        required to write to anything but the local test database
//   --dry-run             read and count only, write nothing
//
// Jobs already checked are skipped, so a stopped run can simply be started again.
// Only jobs that are Approved or further along are read. Cancelled jobs are left
// out: in a 20-job smoke test 1 of 20 had ever reached Approved, and a cancelled
// contract is not a signing the backtest or the neighbour bonus should count.
// Prints counts only: never job names, addresses or keys.

import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { createClient } from "../src/lib/acculynx/client";
import { cleanBranchName, getLocationKeys } from "../src/lib/acculynx/config";
import { signedDateFrom } from "../src/lib/canvass/jobs";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { monthsBefore, centralDay } from "../src/lib/canvass/dates";
import { CanvassJobModel } from "../src/lib/models/CanvassJob";

const STAGES_TO_READ = ["Approved", "Completed", "Invoiced", "Closed"];

type Options = { env: string; sinceMonths: number; maxJobs: number; uri: string; allowRemote: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { env: path.resolve(".env"), sinceMonths: 15, maxJobs: Infinity, uri: "mongodb://127.0.0.1:27017/millerstorm", allowRemote: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--env") options.env = argv[++i] ?? "";
    else if (arg === "--since-months") options.sinceMonths = Number(argv[++i]);
    else if (arg === "--max-jobs") options.maxJobs = Number(argv[++i]);
    else if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.sinceMonths) || options.sinceMonths < 1) throw new Error("--since-months must be a whole number of 1 or more");
  if (!(options.maxJobs > 0)) throw new Error("--max-jobs must be a positive number");
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isLocalTestDatabase(options.uri) && !options.allowRemote) {
    throw new Error("Refusing to write to anything but the local test database. Pass --allow-remote only when approved.");
  }
  const locations = getLocationKeys(readEnvKeys(options.env, (name) => name === "ACCULYNX_API_KEY" || name.startsWith("ACCULYNX_API_KEY_")));
  if (locations.length === 0) throw new Error("No AccuLynx keys found in the env file");

  await mongoose.connect(options.uri);
  const today = centralDay(new Date()) ?? new Date().toISOString().slice(0, 10);
  const since = new Date(`${monthsBefore(today, options.sinceMonths)}T00:00:00Z`);
  let read = 0;
  let signed = 0;

  for (const { envVar, key } of locations) {
    if (read >= options.maxJobs) break;
    const client = createClient(key);
    const company = await client.fetchCompanySettings();
    const branch = company ? cleanBranchName(company.name) : envVar.replace(/^ACCULYNX_API_KEY_?/, "") || "Unknown";

    const jobs = (await CanvassJobModel.find(
      { branch, milestone: { $in: STAGES_TO_READ }, jobModifiedAt: { $gte: since }, signedCheckedAt: null },
      { jobId: 1 }
    ).lean()) as Array<{ _id: unknown; jobId: string }>;

    let branchRead = 0;
    let branchSigned = 0;
    for (const job of jobs) {
      if (read >= options.maxJobs) break;
      const history = await client.fetchMilestoneHistory(job.jobId);
      const signedAt = signedDateFrom(history);
      read++;
      branchRead++;
      if (signedAt) {
        signed++;
        branchSigned++;
      }
      if (!options.dryRun) {
        await CanvassJobModel.updateOne({ _id: job._id }, { $set: { signedAt: signedAt ? new Date(signedAt) : null, signedCheckedAt: new Date() } });
      }
    }
    console.log(`[signed] ${branch}: ${jobs.length} jobs to check, ${branchRead} read, ${branchSigned} reached Approved`);
  }

  console.log(`[signed] done: ${read} job histories read, ${signed} with a signing date ${options.dryRun ? "(dry run, nothing written)" : "written"}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[signed] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
