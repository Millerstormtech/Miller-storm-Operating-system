// scripts/dmo-reminders-cron.js
// Keeps the clock for the DMO reminders (weekly: Thursday 6 PM, Friday 9 AM,
// then leaders at Friday 1 PM; monthly: the last day 6 PM, the 1st 9 AM, then
// leaders on the 2nd 9 AM, all Central). Runs as its own PM2 process and only
// POSTs the in-app endpoint every CHECK_INTERVAL. The endpoint decides who gets
// reminded and never double-sends (see pages/api/dmo/reminders-cron.ts), so an
// overlapping schedule, or a restart, is always safe.

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
// localhost, as the other crons use: the subdomain middleware reads a bare
// IP's first label as a rep's subdomain.
const URL = `http://localhost:${PORT}/api/dmo/reminders-cron`;
const SECRET = process.env.ACCULYNX_SYNC_SECRET; // the server-trusted secret the other crons present
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes: each reminder has a 3-hour window, so a missed tick is harmless

async function fire() {
  if (!SECRET) {
    console.error("[DMO Reminders Cron] ACCULYNX_SYNC_SECRET is not set, so the endpoint would refuse the call");
    return;
  }
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sync-secret": SECRET },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    console.log(`[DMO Reminders Cron] ${new Date().toISOString()} -> ${res.status}`, JSON.stringify(data).slice(0, 2000));
  } catch (e) {
    console.error("[DMO Reminders Cron] error:", e && e.message ? e.message : e);
  }
}

console.log(`[DMO Reminders Cron] started: checks every ${CHECK_INTERVAL / 60000}m. URL=${URL}`);
fire();
setInterval(fire, CHECK_INTERVAL);
