#!/usr/bin/env node
// PM2 process that fires the Canvass Map's daily refresh at CANVASS_HOUR
// (Central), the same timezone handling as backup-cron.js so the slot does not
// drift with the server's clock or DST. Checks every 30 minutes and runs once
// per calendar day; a run that is still going when the next check comes is
// left alone.
//
// The work itself is scripts/canvass-daily.ts (hail, doors, jobs, matching,
// colours, pre-count), run with the repo's vite-node against the app's own
// database from .env. Unlike the other crons this is not an HTTP client: the
// refresh takes half an hour and pulls files from NOAA, which does not fit a
// request handler, so it runs the scripts directly. Override CANVASS_HOUR in
// .env for a different slot.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const s = raw.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("="); if (eq === -1) continue;
    const k = s.slice(0, eq).trim();
    const v = s.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv(path.resolve(__dirname, "../.env"));

const CANVASS_HOUR = Number(process.env.CANVASS_HOUR ?? 8); // 8am Central: NOAA's 12:00 UTC file for yesterday is out by then
const CHECK_INTERVAL = 30 * 60 * 1000;

// Central wall-clock parts, read explicitly (same approach as backup-cron.js).
function centralNow() {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date())) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

let lastRunDate = null;
let running = false;

function runRefresh() {
  // node + vite-node's own entry file, not the .bin shim (a shell script spawn cannot run everywhere).
  const viteNode = path.resolve(__dirname, "../node_modules/vite-node/vite-node.mjs");
  const script = path.resolve(__dirname, "canvass-daily.ts");
  running = true;
  const child = spawn(process.execPath, [viteNode, script], { stdio: "inherit", cwd: path.resolve(__dirname, "..") });
  child.on("exit", (code) => {
    running = false;
    console.log(`[canvass-daily-cron] refresh finished with code ${code}`);
  });
  child.on("error", (error) => {
    running = false;
    console.error(`[canvass-daily-cron] could not start the refresh: ${error.message}`);
  });
}

function tick() {
  const { date, hour } = centralNow();
  if (hour === CANVASS_HOUR && lastRunDate !== date && !running) {
    lastRunDate = date;
    console.log(`[canvass-daily-cron] ${new Date().toISOString()} — starting the daily refresh for ${date}`);
    runRefresh();
  }
}

console.log(`[canvass-daily-cron] started — fires daily at ${CANVASS_HOUR}:00 Central (checks every 30m)`);
tick();
setInterval(tick, CHECK_INTERVAL);
