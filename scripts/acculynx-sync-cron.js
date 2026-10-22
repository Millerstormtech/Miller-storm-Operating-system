// scripts/acculynx-sync-cron.js
// Hourly trigger for the AccuLynx leaderboard sync. Runs as its own PM2 process.
const fs = require("fs");
const path = require("path");

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

const PORT = process.env.PORT || 6790; // prod app port (PM2). 6789 fallback once caused silent "fetch failed" outages.
const URL = `http://127.0.0.1:${PORT}/api/acculynx/sync`;
const SECRET = process.env.ACCULYNX_SYNC_SECRET;
const REFRESH_MS = 30 * 60 * 1000; // every 30 minutes
// The nightly deleted-job check runs on the first tick after 2 AM Central, once a day.
const SWEEP_HOUR_CENTRAL = 2;
let lastSweepDay = "";

function centralDayHour() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

async function post(mode) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sync-secret": SECRET || "" },
    body: JSON.stringify({ mode }),
  });
  console.log(`[acculynx-cron] ${new Date().toISOString()} ${mode} -> ${res.status}`, (await res.text()).slice(0, 200));
}

async function tick() {
  try {
    await post("incremental");
    const { day, hour } = centralDayHour();
    if (hour === SWEEP_HOUR_CENTRAL && day !== lastSweepDay) {
      lastSweepDay = day;
      await post("sweep");
    }
  } catch (e) {
    console.error("[acculynx-cron] error:", e.message);
  }
}

tick();                        // run once on boot
setInterval(tick, REFRESH_MS); // then every 30 minutes
