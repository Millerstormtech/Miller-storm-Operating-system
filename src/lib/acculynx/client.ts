// src/lib/acculynx/client.ts
import { ACCULYNX_BASE } from "./config";

// One client instance per AccuLynx API key (i.e. per location). Each instance keeps
// its OWN request pacer, so different locations can sync without sharing a rate budget
// (AccuLynx allows ~10 req/s PER key). Create with createClient(apiKey).
export function createClient(apiKey: string) {
  if (!apiKey) throw new Error("createClient: missing AccuLynx API key");

  // Per-instance pacing: space requests >= 120ms apart (~8/s) to stay under the limit.
  let nextSlotAt = 0;
  const MIN_INTERVAL_MS = 120;
  async function pace() {
    const now = Date.now();
    const wait = Math.max(0, nextSlotAt - now);
    nextSlotAt = Math.max(now, nextSlotAt) + MIN_INTERVAL_MS;
    if (wait) await new Promise((r) => setTimeout(r, wait));
  }

  // GET with pacing + retry/backoff on 429 + 5xx. Returns parsed JSON, or null on 404.
  async function get(path: string, params: Record<string, string | number> = {}): Promise<any> {
    const url = new URL(ACCULYNX_BASE + path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

    for (let attempt = 0; attempt < 5; attempt++) {
      await pace();
      // Per-request timeout so a hung AccuLynx response can never stall the
      // whole sync forever (this was the DFW "syncing… never completes" cause).
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
          signal: controller.signal,
        });
      } catch (err: any) {
        clearTimeout(timer);
        // Timeout / network error → back off and retry instead of hanging.
        if (attempt < 4) {
          await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250)));
          continue;
        }
        throw new Error(`AccuLynx request failed on ${path}: ${err?.message || err}`);
      }
      clearTimeout(timer);
      if (res.status === 404) return null;
      if (res.ok) return res.json();
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250)));
        continue;
      }
      throw new Error(`AccuLynx ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
    }
    throw new Error(`AccuLynx retries exhausted on ${path}`);
  }

  // AccuLynx caps page size PER ENDPOINT: /jobs max 25, /users max 50 (larger -> HTTP 400).
  const JOBS_PAGE = 25;
  const USERS_PAGE = 50;

  // Which location this key belongs to. `name` is the AccuLynx company name (branch).
  async function fetchCompanySettings(): Promise<{ companyId: string; name: string } | null> {
    const cs = await get("/company-settings");
    return cs?.companyId ? { companyId: cs.companyId, name: cs.name ?? "" } : null;
  }

  // All jobs modified on/after `since` (YYYY-MM-DD). Paginates fully.
  // NOTE: AccuLynx REQUIRES both startDate AND endDate when dateFilterType is set
  // (startDate alone returns HTTP 400). endDate is 2 days ahead to safely include
  // today's jobs regardless of timezone.
  async function fetchJobsModifiedSince(since: string): Promise<any[]> {
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

  const fetchMilestoneHistory = (jobId: string) => get(`/jobs/${jobId}/milestone-history`);
  const fetchRepresentatives = (jobId: string) => get(`/jobs/${jobId}/representatives`);
  const fetchFinancials = (jobId: string) => get(`/jobs/${jobId}/financials`);

  // Paginate /users for one status filter, merging into `map`.
  async function loadUsersInto(map: Record<string, { email: string; name: string; phone: string }>, extra: Record<string, string>) {
    let pageStartIndex = 0;
    for (;;) {
      const page = await get("/users", { pageSize: USERS_PAGE, pageStartIndex, ...extra });
      const items = page?.items ?? [];
      for (const u of items) {
        const name = u.displayName || `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || u.id;
        map[u.id] = { email: (u.email || "").toLowerCase(), name, phone: u.mobilePhone || u.phone || "" };
      }
      if (items.length < USERS_PAGE) break;
      pageStartIndex += USERS_PAGE;
    }
  }

  // All users -> map of AccuLynx userId -> { email, name, phone }.
  // NOTE: /users returns only ACTIVE users by default; reps who were deactivated still
  // own old jobs, so we ALSO pull status=Inactive (else they show as "Unknown Rep").
  async function fetchUserMap(): Promise<Record<string, { email: string; name: string; phone: string }>> {
    const map: Record<string, { email: string; name: string; phone: string }> = {};
    await loadUsersInto(map, {});                      // active users
    await loadUsersInto(map, { status: "Inactive" }); // former/deactivated reps
    return map;
  }

  return {
    fetchCompanySettings,
    fetchJobsModifiedSince,
    fetchMilestoneHistory,
    fetchRepresentatives,
    fetchFinancials,
    fetchUserMap,
  };
}

export type AcculynxClient = ReturnType<typeof createClient>;
