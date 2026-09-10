#!/usr/bin/env node
// PM2 process that fires the nightly MongoDB backup at BACKUP_HOUR (Central),
// mirroring the monthly-king cron's timezone handling so the schedule does not
// drift with the server's timezone or DST. Checks every 30 minutes and runs
// once per calendar day.
const path = require("path");
const { spawn } = require("child_process");

const BACKUP_HOUR = Number(process.env.BACKUP_HOUR ?? 3); // 3am Central
const CHECK_INTERVAL = 30 * 60 * 1000;

// Central wall-clock parts, read explicitly (same approach as monthly-king-cron.js).
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

function runBackup() {
  const script = path.resolve(__dirname, "backup-mongo.js");
  const child = spawn(process.execPath, [script], { stdio: "inherit" });
  child.on("exit", (code) => {
    console.log(`[mongo-backup-cron] backup finished with code ${code}`);
  });
}

function tick() {
  const { date, hour } = centralNow();
  if (hour === BACKUP_HOUR && lastRunDate !== date) {
    lastRunDate = date;
    console.log(`[mongo-backup-cron] ${new Date().toISOString()} — starting daily backup for ${date}`);
    runBackup();
  }
}

console.log(`[mongo-backup-cron] started — fires daily at ${BACKUP_HOUR}:00 Central (checks every 30m)`);
tick();
setInterval(tick, CHECK_INTERVAL);
