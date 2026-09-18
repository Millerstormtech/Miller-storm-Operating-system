// scripts/canvass-daily.ts
// The Canvass Map's daily refresh (plan Milestone 7, spec B5), run by
// scripts/canvass-daily-cron.js on the server: new hail days from NOAA, every
// RepCard door, every AccuLynx job and its signing date, then the matching, the
// house colours and the zoomed-out pre-count. The plan (which days, which
// steps, in what order) is src/lib/canvass/dailyRun.ts; this file only runs it.
//
//   npx vite-node scripts/canvass-daily.ts
//
// Options:
//   --steps a,b,c        run only these steps (names as printed), default all
//   --from/--to <day>    fetch exactly these storm days instead of the missing ones
//   --dry-run            count only, write nothing, fetch nothing
//
// Reads MONGODB_URI, CANVASS_PYTHON (default /opt/kp-hail/bin/python) and
// CANVASS_HAIL_DIR (default ../millerstorm-data/hail, outside the app dir) from
// the environment, then .env. Stops at the first failed step and emails the
// sync alert address (the same one the AccuLynx and RepCard syncs use). Prints
// step names, counts and timings only; the database address is never printed.

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import mongoose from "mongoose";
import { MAX_CATCH_UP_DAYS, dailySteps, failureAlert, stormDaysToFetch, type Step } from "../src/lib/canvass/dailyRun";
import { centralDay } from "../src/lib/canvass/dates";
import { CanvassHailCellModel } from "../src/lib/models/CanvassHailCell";
import { sendEmail } from "../src/lib/email";

type Options = { steps: string[] | null; from: string | null; to: string | null; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { steps: null, from: null, to: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--steps") options.steps = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--from") options.from = argv[++i] ?? null;
    else if (arg === "--to") options.to = argv[++i] ?? null;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if ((options.from === null) !== (options.to === null)) throw new Error("--from and --to go together");
  for (const day of [options.from, options.to]) if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Not a day: ${day}`);
  return options;
}

/** The same .env reading as the cron scripts: a value already in the environment wins. */
function loadEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const s = raw.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("=");
    if (eq === -1) continue;
    const k = s.slice(0, eq).trim();
    const v = s.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

function run(step: Step): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, { stdio: "inherit" });
    child.on("error", (error) => reject(new Error(`${step.name} could not start: ${error.message}`)));
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${step.name} ended with ${signal ? `signal ${signal}` : `code ${code}`}`));
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, "..");
  loadEnv(path.join(root, ".env"));
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const python = process.env.CANVASS_PYTHON || "/opt/kp-hail/bin/python";
  const hailDir = process.env.CANVASS_HAIL_DIR || path.resolve(root, "..", "millerstorm-data", "hail");
  const today = centralDay(new Date());
  if (!today) throw new Error("could not read today's date");

  // Which storm days are missing: from the newest loaded one, unless told exactly.
  let hail: { from: string; to: string } | null;
  if (options.from && options.to) {
    hail = { from: options.from, to: options.to };
  } else {
    await mongoose.connect(uri);
    const newest = (await CanvassHailCellModel.findOne({}, { stormDate: 1 }).sort({ stormDate: -1 }).lean()) as { stormDate?: string } | null;
    await mongoose.disconnect();
    const plan = stormDaysToFetch(newest?.stormDate ?? null, today);
    hail = plan ? { from: plan.from, to: plan.to } : null;
    console.log(`[daily] hail loaded to ${newest?.stormDate ?? "nothing"}; ${plan ? `fetching ${plan.from} to ${plan.to}${plan.capped ? ` (capped at ${MAX_CATCH_UP_DAYS} days; pass --from/--to for older days)` : ""}` : "up to date"}`);
  }
  if (hail && !options.dryRun) fs.mkdirSync(hailDir, { recursive: true });

  const all = dailySteps({
    uri,
    envFile: path.join(root, ".env"),
    python,
    hailDir,
    node: process.execPath,
    viteNodeScript: path.join(root, "node_modules", "vite-node", "vite-node.mjs"),
    scriptsDir: path.join(root, "scripts"),
    hail,
    dryRun: options.dryRun,
  });
  const unknown = (options.steps ?? []).filter((name) => !all.some((s) => s.name === name));
  if (unknown.length) throw new Error(`Unknown step(s): ${unknown.join(", ")}. Steps: ${all.map((s) => s.name).join(", ")}`);
  const steps = options.steps ? all.filter((s) => options.steps!.includes(s.name)) : all;

  console.log(`[daily] ${options.dryRun ? "DRY RUN: " : ""}${steps.length} step(s) for ${today}: ${steps.map((s) => s.name).join(", ")}`);
  const started = Date.now();
  const done: string[] = [];
  for (const step of steps) {
    const at = Date.now();
    console.log(`[daily] ${step.name}: ${step.description}`);
    try {
      await run(step);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[daily] FAILED at ${step.name} after ${((Date.now() - at) / 60000).toFixed(1)} min: ${message}`);
      if (!options.dryRun) {
        const alert = failureAlert(step.name, message, done);
        const to = process.env.SYNC_ALERT_EMAIL || process.env.RESEND_FROM_ADDRESS || "tech@millerstorm.com";
        await sendEmail({ to, ...alert }).catch(() => {}); // a safety net, never a second failure
      }
      process.exit(1);
    }
    done.push(step.name);
    console.log(`[daily] ${step.name} done in ${((Date.now() - at) / 60000).toFixed(1)} min`);
  }
  console.log(`[daily] refresh complete: ${done.length} step(s) in ${((Date.now() - started) / 60000).toFixed(1)} min`);
}

main().catch(async (error) => {
  console.error("[daily] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
