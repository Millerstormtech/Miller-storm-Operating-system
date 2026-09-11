// scripts/weekly-digest-cron.js
// Sends the weekly team-training digest to every manager — once a week, on
// DIGEST_DAY at DIGEST_HOUR, CENTRAL time (default Monday 08:00). Runs as its
// own PM2 process. Fires by POSTing the in-app endpoint, which does the work.
//
// Central wall-clock is read explicitly (like monthly-king-cron.js): the VPS
// timezone is not guaranteed to be Central, and reading getDay()/getHours()
// silently drifted "Monday 8am" by the server's offset and again at each DST
// change. "Monday morning Central" is the actual requirement.

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
const URL = `http://localhost:${PORT}/api/playlist-assignments/weekly-digest`;
const SECRET = process.env.ACCULYNX_SYNC_SECRET; // reused server-trusted secret (optional)
const ADMIN_USER = process.env.DIGEST_ADMIN_USER || "marketing@millerstorm.com"; // fallback auth
const DIGEST_DAY = Number(process.env.DIGEST_DAY ?? 1); // 0=Sun, 1=Mon
const DIGEST_HOUR = Number(process.env.DIGEST_HOUR ?? 8); // 24h CENTRAL time
const CHECK_INTERVAL = 30 * 60 * 1000; // re-check every 30 min

let lastFiredDate = ""; // YYYY-MM-DD we last fired on (prevents same-day re-send)

// Central wall-clock parts (date, weekday 0=Sun, hour), read via Intl so CST/CDT
// are handled for us regardless of the server timezone.
function centralParts() {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short",
  });
  const p = {};
  for (const part of dtf.formatToParts(now)) p[part.type] = part.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date: `${p.year}-${p.month}-${p.day}`, day: weekdayMap[p.weekday], hour: Number(p.hour) };
}

async function fire() {
  try {
    const headers = { "Content-Type": "application/json" };
    if (SECRET) headers["x-sync-secret"] = SECRET;
    const res = await fetch(URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ userId: ADMIN_USER }),
    });
    const data = await res.json().catch(() => ({}));
    console.log(`[Weekly Digest Cron] fired -> ${res.status}`, JSON.stringify(data));
  } catch (e) {
    console.error("[Weekly Digest Cron] error:", e && e.message ? e.message : e);
  }
}

function tick() {
  const { date, day, hour } = centralParts();
  if (day === DIGEST_DAY && hour === DIGEST_HOUR && lastFiredDate !== date) {
    lastFiredDate = date;
    console.log(`[Weekly Digest Cron] ${new Date().toISOString()} — sending weekly digest (Central ${date})`);
    fire();
  }
}

console.log(
  `[Weekly Digest Cron] started — fires on day ${DIGEST_DAY} at ${DIGEST_HOUR}:00 Central (checks every 30m). URL=${URL}`
);
tick();
setInterval(tick, CHECK_INTERVAL);
