// scripts/monthly-king-cron.js
// Fires the monthly Contract King announcement: the 1st of each month at 09:00
// CENTRAL. Runs as its own PM2 process. Like the other three crons here it is a
// clock, not a worker: it POSTs the in-app endpoint, which does the work.

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

// PORT must be the MAIN app's port (6790): this POSTs to the Next app, which is
// what serves /api/stormbot/monthly-king. Nothing listens on 6789. Note that
// loadEnv above uses `if (!(k in process.env))`, so a PORT injected by PM2
// ALWAYS wins over .env; the ecosystem entry must therefore say 6790 too.
const PORT = process.env.PORT || 6790;
const URL = `http://127.0.0.1:${PORT}/api/stormbot/monthly-king`;
const SECRET = process.env.ACCULYNX_SYNC_SECRET;

const KING_DAY = Number(process.env.KING_DAY ?? 1);    // day of month
const KING_HOUR = Number(process.env.KING_HOUR ?? 9);  // 24h, Central
const CHECK_INTERVAL = 15 * 60 * 1000;                 // re-check every 15 min

// Central wall-clock parts, read explicitly rather than via the server's local
// time. The VPS timezone is not guaranteed to be Central, and "9am Central" is
// the actual requirement: reading getHours() would silently drift the post by
// however many hours the server is offset, and again by an hour at every DST
// change. Intl handles CST/CDT for us.
function centralNow() {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date())) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    day: Number(p.day),
    hour: Number(p.hour) % 24, // some Node versions render midnight as "24"
  };
}

// Guards against re-firing within THIS process. It does not survive a restart,
// which is exactly why the endpoint also holds a once-ever row in the database:
// a PM2 restart at 09:10 on the 1st would otherwise post the crowning twice.
let lastFiredDate = "";

async function fire() {
  try {
    const headers = { "Content-Type": "application/json" };
    if (SECRET) headers["x-sync-secret"] = SECRET;
    const res = await fetch(URL, { method: "POST", headers, body: JSON.stringify({}) });
    const body = (await res.text()).slice(0, 300);
    console.log(`[monthly-king] ${new Date().toISOString()} -> ${res.status} ${body}`);
  } catch (e) {
    console.error("[monthly-king] error:", e && e.message ? e.message : e);
  }
}

function tick() {
  const now = centralNow();
  if (now.day === KING_DAY && now.hour === KING_HOUR && lastFiredDate !== now.date) {
    lastFiredDate = now.date;
    console.log(`[monthly-king] ${now.date} ${now.hour}:00 Central — announcing last month's Contract King`);
    fire();
  }
}

console.log(
  `[monthly-king] started — fires on day ${KING_DAY} at ${KING_HOUR}:00 America/Chicago ` +
  `(checks every 15m). URL=${URL}`
);
tick();
setInterval(tick, CHECK_INTERVAL);
