// scripts/training-nudge-cron.js
// Nudges reps who have stalled in a course, once a day at NUDGE_HOUR, CENTRAL
// time (default 10:00). Runs as its own PM2 process and only keeps the clock:
// it POSTs the in-app endpoint, which decides who is nudged and whether anything
// is really sent (TRAINING_NUDGE_MODE in the app's .env: off, dry or on; dry
// when unset, so installing this process sends nothing on its own).
//
// Central wall-clock is read explicitly, like weekly-digest-cron.js: the VPS
// timezone is not guaranteed to be Central.

const fs = require("fs");
const path = require("path");

function loadEnv(file) {
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
loadEnv(path.resolve(__dirname, "../.env"));

const PORT = process.env.PORT || 6790;
// localhost, as weekly-digest-cron.js uses: the subdomain middleware reads a
// bare IP's first label as a rep's subdomain.
const URL = `http://localhost:${PORT}/api/training/nudges`;
const SECRET = process.env.ACCULYNX_SYNC_SECRET; // the server-trusted secret the other crons present
const NUDGE_HOUR = Number(process.env.NUDGE_HOUR ?? 10); // 24h CENTRAL time
const CHECK_INTERVAL = 30 * 60 * 1000; // re-check every 30 min

let lastFiredDate = ""; // YYYY-MM-DD (Central) we last fired on

function centralParts() {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date())) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

async function fire(date) {
  if (!SECRET) {
    console.error("[Training Nudge Cron] ACCULYNX_SYNC_SECRET is not set, so the endpoint would refuse the call");
    return;
  }
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sync-secret": SECRET },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    console.log(`[Training Nudge Cron] ${date} -> ${res.status}`, JSON.stringify(data).slice(0, 4000));
  } catch (e) {
    console.error("[Training Nudge Cron] error:", e && e.message ? e.message : e);
  }
}

function tick() {
  const { date, hour } = centralParts();
  if (hour === NUDGE_HOUR && lastFiredDate !== date) {
    lastFiredDate = date;
    fire(date);
  }
}

console.log(`[Training Nudge Cron] started: fires daily at ${NUDGE_HOUR}:00 Central (checks every 30m). URL=${URL}`);
tick();
setInterval(tick, CHECK_INTERVAL);
