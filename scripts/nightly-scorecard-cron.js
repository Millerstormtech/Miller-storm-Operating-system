// scripts/nightly-scorecard-cron.js
// Fires the nightly Storm Bot SCORECARD at 22:00 CENTRAL every day.
// Runs as its own PM2 process. Like the other crons here it is a clock, not a
// worker: it POSTs the in-app endpoint, which does the work.

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
// what serves /api/stormbot/nightly-scorecard. Nothing listens on 6789. Note that
// loadEnv above uses `if (!(k in process.env))`, so a PORT injected by PM2
// ALWAYS wins over .env; the ecosystem entry must therefore say 6790 too.
const PORT = process.env.PORT || 6790;
const URL = `http://127.0.0.1:${PORT}/api/stormbot/nightly-scorecard`;
const SECRET = process.env.ACCULYNX_SYNC_SECRET;

// Must match SCORECARD_HOUR in src/lib/stormbot/scorecard.ts (the scorecard
// window's end). Deliberately not an env knob: if the two differ, wins between
// the two times would land in no scorecard.
const SCORECARD_HOUR = 22;            // 24h, Central
const CHECK_INTERVAL = 60 * 1000;     // re-check every minute

// Central wall-clock parts, read explicitly rather than via the server's local
// time. The VPS timezone is not guaranteed to be Central, and "10pm Central" is
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
// which is exactly why the endpoint also holds a per-date row in the database:
// a PM2 restart at 22:10 would otherwise post tonight's scorecard twice.
let lastFiredDate = "";

async function fire() {
  try {
    const headers = { "Content-Type": "application/json" };
    if (SECRET) headers["x-sync-secret"] = SECRET;
    const res = await fetch(URL, { method: "POST", headers, body: JSON.stringify({}) });
    const body = (await res.text()).slice(0, 300);
    console.log(`[nightly-scorecard] ${new Date().toISOString()} -> ${res.status} ${body}`);
  } catch (e) {
    console.error("[nightly-scorecard] error:", e && e.message ? e.message : e);
  }
}

function tick() {
  const now = centralNow();
  if (now.hour === SCORECARD_HOUR && lastFiredDate !== now.date) {
    lastFiredDate = now.date;
    console.log(`[nightly-scorecard] ${now.date} ${now.hour}:00 Central — posting tonight's scorecard`);
    fire();
  }
}

console.log(
  `[nightly-scorecard] started — fires daily at ${SCORECARD_HOUR}:00 America/Chicago ` +
  `(checks every 1m). URL=${URL}`
);
tick();
setInterval(tick, CHECK_INTERVAL);
