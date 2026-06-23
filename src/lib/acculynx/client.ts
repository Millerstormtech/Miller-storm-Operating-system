// src/lib/acculynx/client.ts
import { ACCULYNX_BASE } from "./config";

function apiKey(): string {
  const k = process.env.ACCULYNX_API_KEY;
  if (!k) throw new Error("ACCULYNX_API_KEY is not set");
  return k;
}

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// Global request pacing: AccuLynx allows ~10 req/s per API key. We space every
// request >= 120ms apart (~8/s) so the backfill (hundreds of jobs x 3 calls each)
// stays UNDER the limit instead of bursting into 429s + slow exponential backoff.
// Shared module state serializes even the concurrent (Promise.all) per-job calls.
let nextSlotAt = 0;
const MIN_INTERVAL_MS = 120;
async function pace() {
  const now = Date.now();
  const wait = Math.max(0, nextSlotAt - now);
  nextSlotAt = Math.max(now, nextSlotAt) + MIN_INTERVAL_MS;
  if (wait) await sleep(wait);
}

// GET with pacing + retry/backoff on 429 + 5xx. Returns parsed JSON, or null on 404.
async function get(path: string, params: Record<string, string | number> = {}): Promise<any> {
  const url = new URL(ACCULYNX_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  for (let attempt = 0; attempt < 5; attempt++) {
    await pace();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey()}`, Accept: "application/json" },
    });
    if (res.status === 404) return null;
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await sleep(Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250));
      continue;
    }
    throw new Error(`AccuLynx ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error(`AccuLynx retries exhausted on ${path}`);
}

// AccuLynx caps page size at 50 across list endpoints (pageSize > 50 -> HTTP 400).
// AccuLynx caps page size PER ENDPOINT: /jobs max 25, /users max 50 (larger -> HTTP 400).
const JOBS_PAGE = 25;
const USERS_PAGE = 50;

// All jobs modified on/after `since` (YYYY-MM-DD). Paginates fully.
// NOTE: AccuLynx REQUIRES both startDate AND endDate when dateFilterType is set
// (startDate alone returns HTTP 400). endDate is set 2 days ahead to safely
// include today's jobs regardless of timezone.
export async function fetchJobsModifiedSince(since: string): Promise<any[]> {
  const out: any[] = [];
  const endDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  let pageStartIndex = 0;
  for (;;) {
    const page = await get("/jobs", {
      dateFilterType: "ModifiedDate", startDate: since, endDate,
      sortBy: "ModifiedDate", sortOrder: "Descending",
      pageSize: JOBS_PAGE, pageStartIndex,
    });
    const items = page?.items ?? [];
    out.push(...items);
    if (items.length < JOBS_PAGE) break;
    pageStartIndex += JOBS_PAGE;
    if (pageStartIndex > 100000) break; // AccuLynx hard cap guard
  }
  return out;
}

export async function fetchMilestoneHistory(jobId: string) { return get(`/jobs/${jobId}/milestone-history`); }
export async function fetchRepresentatives(jobId: string) { return get(`/jobs/${jobId}/representatives`); }
export async function fetchFinancials(jobId: string) { return get(`/jobs/${jobId}/financials`); }

// Paginate /users for one status filter, merging into `map`.
async function loadUsersInto(map: Record<string, { email: string; name: string }>, extra: Record<string, string>) {
  let pageStartIndex = 0;
  for (;;) {
    const page = await get("/users", { pageSize: USERS_PAGE, pageStartIndex, ...extra });
    const items = page?.items ?? [];
    for (const u of items) {
      const name = u.displayName || `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || u.id;
      map[u.id] = { email: (u.email || "").toLowerCase(), name };
    }
    if (items.length < USERS_PAGE) break;
    pageStartIndex += USERS_PAGE;
  }
}

// All users -> map of AccuLynx userId -> { email, name }.
// NOTE: /users returns only ACTIVE users by default; reps who were deactivated
// still own old jobs, so we ALSO pull status=Inactive (else they show as
// "Unknown Rep"). includeInactive/userStatus=All are silently ignored by the API.
export async function fetchUserMap(): Promise<Record<string, { email: string; name: string }>> {
  const map: Record<string, { email: string; name: string }> = {};
  await loadUsersInto(map, {});                      // active users
  await loadUsersInto(map, { status: "Inactive" }); // former/deactivated reps
  return map;
}
