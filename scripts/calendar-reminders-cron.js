// scripts/calendar-reminders-cron.js
// Keeps the clock for Google Calendar event reminders (24h/1h/30m before an
// event starts). Runs as its own PM2 process and only POSTs the in-app
// endpoint every CHECK_INTERVAL — the endpoint decides who gets reminded and
// never double-sends (see pages/api/calendar/reminders-cron.ts), so calling
// it on an overlapping schedule, or after a restart, is always safe.
//
// Unlike training-nudge-cron.js / weekly-digest-cron.js this has no
// "fire once a day" gate: reminders are time-sensitive to the minute, so it
// just polls on a short interval forever.

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
const URL = `http://localhost:${PORT}/api/calendar/reminders-cron`;
const SECRET = process.env.ACCULYNX_SYNC_SECRET; // the server-trusted secret the other crons present
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes — tight enough that the 30m lead time is never missed by more than one tick

async function fire() {
  if (!SECRET) {
    console.error("[Calendar Reminders Cron] ACCULYNX_SYNC_SECRET is not set, so the endpoint would refuse the call");
    return;
  }
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sync-secret": SECRET },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    console.log(`[Calendar Reminders Cron] ${new Date().toISOString()} -> ${res.status}`, JSON.stringify(data).slice(0, 2000));
  } catch (e) {
    console.error("[Calendar Reminders Cron] error:", e && e.message ? e.message : e);
  }
}

console.log(`[Calendar Reminders Cron] started: checks every ${CHECK_INTERVAL / 60000}m. URL=${URL}`);
fire();
setInterval(fire, CHECK_INTERVAL);
