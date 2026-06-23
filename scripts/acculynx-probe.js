/**
 * AccuLynx PROBE (read-only)
 *
 * Purpose: discover the REAL shapes of AccuLynx data for this account so the
 * leaderboard-sync code is built against reality, not guesses. It only performs
 * GET requests — it never writes anything to AccuLynx.
 *
 * It reports:
 *   1. A few recent jobs (field keys + one sample) — to find the rep field, dollar fields, branch.
 *   2. Milestone history for one job — to confirm we get the DATE each stage was reached.
 *   3. The company's workflow milestone (stage) names — to build the stage->metric mapping.
 *   4. A couple of users — to confirm the user id/email we match reps on.
 *
 * Usage: node scripts/acculynx-probe.js
 */

const path = require("path");
const fs = require("fs");

// Minimal .env reader (no dependency on the dotenv package).
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const lineStr = raw.trim();
    if (!lineStr || lineStr.startsWith("#")) continue;
    const eq = lineStr.indexOf("=");
    if (eq === -1) continue;
    const key = lineStr.slice(0, eq).trim();
    const val = lineStr.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv(path.resolve(__dirname, "../.env"));

const API_KEY = process.env.ACCULYNX_API_KEY;
const BASE = "https://api.acculynx.com/api/v2";

if (!API_KEY) {
  console.error("❌ ACCULYNX_API_KEY not found in .env");
  process.exit(1);
}

async function apiGet(pathname, params = {}) {
  const url = new URL(BASE + pathname);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
  });
  let body;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, url: url.toString(), body };
}

function keysOf(obj) {
  return obj && typeof obj === "object" ? Object.keys(obj) : [];
}

function line(label) {
  console.log("\n" + "=".repeat(70) + "\n" + label + "\n" + "=".repeat(70));
}

(async () => {
  console.log(`🔎 Probing AccuLynx with key ${API_KEY.slice(0, 8)}…  (read-only)`);

  // ---- 1. JOBS LIST (most recently modified) ----
  line("1) JOBS LIST  GET /jobs  (pageSize=3, sorted by ModifiedDate desc)");
  const jobs = await apiGet("/jobs", {
    pageSize: 3,
    sortBy: "ModifiedDate",
    sortOrder: "Descending",
  });
  console.log("HTTP", jobs.status, "→", jobs.url);
  if (!jobs.ok) {
    console.log("Body:", JSON.stringify(jobs.body, null, 2));
  } else {
    const items = jobs.body.items || jobs.body.results || jobs.body.data || [];
    console.log("Top-level response keys:", keysOf(jobs.body));
    console.log("Job count returned:", items.length);
    if (items[0]) {
      console.log("\n-- First job: FIELD KEYS --");
      console.log(keysOf(items[0]));
      console.log("\n-- First job: FULL SAMPLE --");
      console.log(JSON.stringify(items[0], null, 2));
    }
    // stash first job id for milestone probe
    global.__firstJobId =
      items[0]?.jobId || items[0]?.id || items[0]?.jobNumber || null;
  }

  const jobId = global.__firstJobId;

  // ---- 2. MILESTONE HISTORY for one job ----
  line(`2) MILESTONE HISTORY for job ${jobId}`);
  if (jobId) {
    // try the two documented shapes
    for (const p of [`/jobs/${jobId}/milestones`, `/jobs/${jobId}/milestone-history`]) {
      const ms = await apiGet(p);
      console.log(`\nGET ${p} → HTTP ${ms.status}`);
      if (ms.ok) {
        console.log("Response keys:", keysOf(ms.body));
        console.log(JSON.stringify(ms.body, null, 2));
        break;
      } else {
        console.log("Body:", JSON.stringify(ms.body, null, 2).slice(0, 400));
      }
    }
  } else {
    console.log("No job id captured; skipping.");
  }

  // ---- 3. WORKFLOW MILESTONES (the company's stage names) ----
  line("3) WORKFLOW MILESTONES (stage names)  GET /company-settings/job-file-settings/workflow-milestones");
  const wf = await apiGet("/company-settings/job-file-settings/workflow-milestones");
  console.log("HTTP", wf.status);
  console.log(JSON.stringify(wf.body, null, 2));

  // ---- 4. USERS ----
  line("4) USERS  GET /users  (pageSize=3)");
  const users = await apiGet("/users", { pageSize: 3 });
  console.log("HTTP", users.status);
  if (users.ok) {
    const items = users.body.items || users.body.results || users.body.data || [];
    console.log("Response keys:", keysOf(users.body));
    if (items[0]) {
      console.log("First user FIELD KEYS:", keysOf(items[0]));
      console.log("First user SAMPLE:", JSON.stringify(items[0], null, 2));
    }
  } else {
    console.log("Body:", JSON.stringify(users.body, null, 2));
  }

  // ---- 5. JOB DETAIL (look for the rep + money) ----
  line(`5) JOB DETAIL  GET /jobs/${jobId}`);
  if (jobId) {
    const detail = await apiGet(`/jobs/${jobId}`);
    console.log("HTTP", detail.status);
    if (detail.ok) {
      console.log("DETAIL FIELD KEYS:", keysOf(detail.body));
      console.log(JSON.stringify(detail.body, null, 2));
    } else {
      console.log("Body:", JSON.stringify(detail.body, null, 2).slice(0, 400));
    }
  }

  // ---- 6. CANDIDATE SUB-RESOURCES for rep + financials ----
  line("6) CANDIDATE SUB-RESOURCES (rep / financials / assignments)");
  if (jobId) {
    const candidates = [
      `/jobs/${jobId}/financials`,
      `/jobs/${jobId}/users`,
      `/jobs/${jobId}/assignments`,
      `/jobs/${jobId}/representatives`,
      `/jobs/${jobId}/sales-representatives`,
      `/jobs/${jobId}/team`,
      `/jobs/${jobId}/estimate`,
      `/jobs/${jobId}/estimates`,
    ];
    for (const p of candidates) {
      const r = await apiGet(p);
      console.log(`\nGET ${p} → HTTP ${r.status}`);
      if (r.ok) {
        const preview = JSON.stringify(r.body, null, 2);
        console.log(preview.length > 1500 ? preview.slice(0, 1500) + "\n…(truncated)" : preview);
      }
    }
  }

  line("PROBE COMPLETE — review the field keys above to finalize the mapping.");
})().catch((e) => {
  console.error("Probe error:", e);
  process.exit(1);
});
