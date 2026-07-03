// scripts/repcard-sync-cron.js
// Hourly trigger for the RepCard Verified-Door-Knocks sync. Runs as its own PM2 process.
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

const PORT = process.env.PORT || 6789;
const URL = `http://localhost:${PORT}/api/repcard/sync`;
const SECRET = process.env.REPCARD_SYNC_SECRET;
const HOUR = 60 * 60 * 1000;

async function tick() {
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sync-secret": SECRET || "" },
      body: JSON.stringify({ mode: "incremental" }),
    });
    console.log(`[repcard-cron] ${new Date().toISOString()} -> ${res.status}`, (await res.text()).slice(0, 200));
  } catch (e) {
    console.error("[repcard-cron] error:", e.message);
  }
}

tick();                  // run once on boot
setInterval(tick, HOUR); // then hourly
