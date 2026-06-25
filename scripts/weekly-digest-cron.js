// scripts/weekly-digest-cron.js
// Sends the weekly team-training digest to every manager — once a week, on
// Monday at DIGEST_HOUR (server local time, default 08:00). Runs as its own
// PM2 process. Fires by POSTing the in-app endpoint, which does the work.

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
const DIGEST_HOUR = Number(process.env.DIGEST_HOUR ?? 8); // 24h local time
const CHECK_INTERVAL = 30 * 60 * 1000; // re-check every 30 min

let lastFiredDate = ""; // YYYY-MM-DD we last fired on (prevents same-day re-send)

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
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  if (now.getDay() === DIGEST_DAY && now.getHours() === DIGEST_HOUR && lastFiredDate !== dateStr) {
    lastFiredDate = dateStr;
    console.log(`[Weekly Digest Cron] ${now.toISOString()} — sending weekly digest`);
    fire();
  }
}

console.log(
  `[Weekly Digest Cron] started — fires on day ${DIGEST_DAY} at ${DIGEST_HOUR}:00 (checks every 30m). URL=${URL}`
);
tick();
setInterval(tick, CHECK_INTERVAL);
